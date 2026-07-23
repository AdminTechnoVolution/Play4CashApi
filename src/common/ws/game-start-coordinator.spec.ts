import {
  acquireGameStartLease,
  publishGameStarted,
  releaseGameStartLease,
} from './game-start-coordinator';

describe('game start coordinator', () => {
  it('allows only one concurrent start lease', async () => {
    let locked = false;
    const model = {
      findOneAndUpdate: jest.fn(async (_filter: any, update: any) => {
        if (locked) return null;
        locked = true;
        return { _id: 'room-1', status: 'waiting', start_lock: update.$set.start_lock };
      }),
    } as any;

    const [first, second] = await Promise.all([
      acquireGameStartLease(model, 'room-1'),
      acquireGameStartLease(model, 'room-1'),
    ]);

    expect([first, second].filter(Boolean)).toHaveLength(1);
  });

  it('publishes started only for the lease owner and removes the lock', async () => {
    const model = { findOneAndUpdate: jest.fn().mockResolvedValue({ status: 'started' }) } as any;

    await publishGameStarted(model, 'room-1', 'lease-1', { turn_start_time: expect.anything() });

    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: 'room-1',
        status: { $in: ['waiting', 'started'] },
        start_lock: 'lease-1',
      },
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'started',
          game_ready_at: expect.any(Date),
        }),
        $unset: { start_lock: 1, start_locked_at: 1 },
      }),
      { returnDocument: 'after' },
    );
  });

  it('releases a failed attempt without changing the public room status', async () => {
    const model = { updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }) } as any;

    await releaseGameStartLease(model, 'room-1', 'lease-1');

    expect(model.updateOne).toHaveBeenCalledWith(
      {
        _id: 'room-1',
        status: { $in: ['waiting', 'started'] },
        start_lock: 'lease-1',
      },
      { $unset: { start_lock: 1, start_locked_at: 1 } },
    );
  });

  it('can initialize game state after the HTTP join already published started', async () => {
    const model = {
      findOneAndUpdate: jest.fn().mockResolvedValue({
        _id: 'room-1',
        status: 'started',
        start_lock: 'lease-1',
      }),
    } as any;

    await acquireGameStartLease(model, 'room-1');

    expect(model.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        _id: 'room-1',
        status: { $in: ['waiting', 'started'] },
      }),
      expect.anything(),
      expect.anything(),
    );
  });
});
