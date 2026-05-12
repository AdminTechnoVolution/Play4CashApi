import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { GracePeriodService } from './grace-period.service';
import { GracePeriod } from './grace-period.schema';

describe('GracePeriodService', () => {
  let service: GracePeriodService;
  let modelMock: {
    findOneAndUpdate: jest.Mock;
    deleteOne: jest.Mock;
    updateOne: jest.Mock;
  };

  beforeEach(async () => {
    modelMock = {
      findOneAndUpdate: jest.fn(),
      deleteOne: jest.fn().mockResolvedValue({ deletedCount: 0 }),
      updateOne: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GracePeriodService,
        { provide: getModelToken(GracePeriod.name), useValue: modelMock },
      ],
    }).compile();

    service = module.get<GracePeriodService>(GracePeriodService);
  });

  describe('start()', () => {
    it('upserts a grace record with the upper-bound of MIN_GRACE_SECS', async () => {
      modelMock.findOneAndUpdate.mockResolvedValue({});
      await service.start('uno', 'p1', 'r1', 5); // below 30s floor

      expect(modelMock.findOneAndUpdate).toHaveBeenCalledTimes(1);
      const [filter, update, options] = modelMock.findOneAndUpdate.mock.calls[0];
      expect(filter).toEqual({ game_name: 'uno', player_id: 'p1' });
      expect(options).toEqual({ upsert: true });

      const expiresAt: Date = update.$set.expires_at;
      const ttlMs = expiresAt.getTime() - Date.now();
      // Should be clamped to ~30s (allow 1s skew)
      expect(ttlMs).toBeGreaterThanOrEqual(29_000);
      expect(ttlMs).toBeLessThanOrEqual(31_000);
      expect(update.$set.room_id).toBe('r1');
      expect(update.$set.processing).toBe(false);
    });

    it('respects a TTL above the floor', async () => {
      modelMock.findOneAndUpdate.mockResolvedValue({});
      await service.start('chess', 'p2', 'r2', 90);

      const update = modelMock.findOneAndUpdate.mock.calls[0][1];
      const ttlMs = update.$set.expires_at.getTime() - Date.now();
      expect(ttlMs).toBeGreaterThanOrEqual(89_000);
      expect(ttlMs).toBeLessThanOrEqual(91_000);
    });

    it('swallows DB errors so disconnect handler never bubbles', async () => {
      modelMock.findOneAndUpdate.mockRejectedValue(new Error('boom'));
      await expect(service.start('uno', 'p1', 'r1', 60)).resolves.toBeUndefined();
    });
  });

  describe('cancel()', () => {
    it('deletes the grace row keyed by (game, player)', async () => {
      modelMock.deleteOne.mockResolvedValue({ deletedCount: 1 });
      await service.cancel('uno', 'p1');
      expect(modelMock.deleteOne).toHaveBeenCalledWith({ game_name: 'uno', player_id: 'p1' });
    });

    it('is a no-op when no row exists', async () => {
      modelMock.deleteOne.mockResolvedValue({ deletedCount: 0 });
      await expect(service.cancel('uno', 'ghost')).resolves.toBeUndefined();
    });

    it('swallows DB errors', async () => {
      modelMock.deleteOne.mockRejectedValue(new Error('boom'));
      await expect(service.cancel('uno', 'p1')).resolves.toBeUndefined();
    });
  });

  describe('sweep()', () => {
    it('invokes the registered handler for an expired row, then deletes it', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      service.registerHandler('uno', handler);

      modelMock.findOneAndUpdate
        .mockResolvedValueOnce({ _id: 'doc1', game_name: 'uno', player_id: 'p1', room_id: 'r1' })
        .mockResolvedValueOnce(null);

      await service.sweep();

      expect(handler).toHaveBeenCalledWith('p1', 'r1');
      expect(modelMock.deleteOne).toHaveBeenCalledWith({ _id: 'doc1' });
    });

    it('releases the processing lock (no delete) when no handler is registered for the row', async () => {
      modelMock.findOneAndUpdate.mockResolvedValueOnce({
        _id: 'doc1',
        game_name: 'unknown-game',
        player_id: 'p1',
        room_id: 'r1',
      });

      await service.sweep();

      expect(modelMock.updateOne).toHaveBeenCalledWith(
        { _id: 'doc1' },
        { $set: { processing: false } },
      );
      // Row was NOT deleted — another replica with the handler can claim it on the next tick.
      expect(modelMock.deleteOne).not.toHaveBeenCalled();
    });

    it('still deletes the row when the handler throws (idempotent forfeit assumption)', async () => {
      const handler = jest.fn().mockRejectedValue(new Error('forfeit failed'));
      service.registerHandler('chess', handler);

      modelMock.findOneAndUpdate
        .mockResolvedValueOnce({ _id: 'doc2', game_name: 'chess', player_id: 'p2', room_id: 'r2' })
        .mockResolvedValueOnce(null);

      await service.sweep();

      expect(handler).toHaveBeenCalled();
      expect(modelMock.deleteOne).toHaveBeenCalledWith({ _id: 'doc2' });
    });

    it('processes up to BATCH_LIMIT records per tick', async () => {
      const handler = jest.fn().mockResolvedValue(undefined);
      service.registerHandler('uno', handler);

      // 3 sequential rows, then null
      modelMock.findOneAndUpdate
        .mockResolvedValueOnce({ _id: '1', game_name: 'uno', player_id: 'a', room_id: 'r' })
        .mockResolvedValueOnce({ _id: '2', game_name: 'uno', player_id: 'b', room_id: 'r' })
        .mockResolvedValueOnce({ _id: '3', game_name: 'uno', player_id: 'c', room_id: 'r' })
        .mockResolvedValueOnce(null);

      await service.sweep();
      expect(handler).toHaveBeenCalledTimes(3);
      expect(modelMock.deleteOne).toHaveBeenCalledTimes(3);
    });

    it('returns early on DB failure during poll (no thrown error)', async () => {
      modelMock.findOneAndUpdate.mockRejectedValue(new Error('mongo down'));
      await expect(service.sweep()).resolves.toBeUndefined();
    });

    it('atomic lock — concurrent sweeps each get a different row (no double-fire)', async () => {
      // Simulate two replicas calling findOneAndUpdate in parallel: the DB hands a
      // unique row to each by `processing: true` filter. We model that by having the
      // mock return distinct rows on the first call from each "replica" and null on
      // subsequent polls (i.e. nothing else to do).
      const handlerA = jest.fn().mockResolvedValue(undefined);
      service.registerHandler('uno', handlerA);

      modelMock.findOneAndUpdate
        .mockResolvedValueOnce({ _id: 'r1', game_name: 'uno', player_id: 'p1', room_id: 'room' })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ _id: 'r2', game_name: 'uno', player_id: 'p2', room_id: 'room' })
        .mockResolvedValueOnce(null);

      await Promise.all([service.sweep(), service.sweep()]);

      expect(handlerA).toHaveBeenCalledTimes(2);
      expect(handlerA).toHaveBeenCalledWith('p1', 'room');
      expect(handlerA).toHaveBeenCalledWith('p2', 'room');
    });
  });

  describe('registerHandler()', () => {
    it('overwrites previous handler (idempotent registration)', async () => {
      const first = jest.fn();
      const second = jest.fn();
      service.registerHandler('uno', first);
      service.registerHandler('uno', second);

      modelMock.findOneAndUpdate
        .mockResolvedValueOnce({ _id: 'd', game_name: 'uno', player_id: 'p', room_id: 'r' })
        .mockResolvedValueOnce(null);

      await service.sweep();

      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledWith('p', 'r');
    });
  });
});
