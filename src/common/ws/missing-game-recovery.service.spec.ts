import { Types } from 'mongoose';
import { MissingGameRecoveryService } from './missing-game-recovery.service';

class Query<T> implements PromiseLike<T> {
  constructor(private readonly value: T) {}
  populate(): this { return this; }
  lean(): Promise<T> { return Promise.resolve(this.value); }
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.value).then(onfulfilled, onrejected);
  }
}

describe('MissingGameRecoveryService', () => {
  it('refunds a damaged casual room exactly once and marks it cancelled', async () => {
    const roomId = new Types.ObjectId();
    const gameId = new Types.ObjectId();
    const players = [new Types.ObjectId(), new Types.ObjectId(), new Types.ObjectId()];
    const room = {
      _id: roomId,
      status: 'started',
      source: 'casual',
      game_ready_at: new Date(),
      game_id: { _id: gameId, socket_code: 'domino' },
      bet_amount: 10,
      players: players.map((playerId) => ({ playerId })),
    };
    const roomModel = {
      find: jest.fn(() => new Query([room])),
      findOneAndUpdate: jest.fn().mockResolvedValue({ ...room, status: 'finished' }),
    };
    const credited = new Set<string>();
    const userModel = {
      findOneAndUpdate: jest.fn(async (filter: any) => {
        const id = String(filter._id);
        if (credited.has(id)) return null;
        credited.add(id);
        return { _id: filter._id };
      }),
      exists: jest.fn(async (filter: any) => credited.has(String(filter._id))),
    };
    const missingModel = { exists: jest.fn().mockResolvedValue(null) };
    const healthyModel = { exists: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }) };
    const roomsGateway = {
      server: {},
      broadcastRoomUpdate: jest.fn(),
    };
    const service = new MissingGameRecoveryService(
      roomModel as any,
      userModel as any,
      healthyModel as any,
      missingModel as any,
      healthyModel as any,
      healthyModel as any,
      healthyModel as any,
      roomsGateway as any,
    );

    await service.reconcile();
    await service.reconcile();

    expect(userModel.findOneAndUpdate).toHaveBeenCalledTimes(6);
    expect(credited.size).toBe(3);
    for (const playerId of players) {
      expect(userModel.findOneAndUpdate).toHaveBeenCalledWith(
        {
          _id: playerId,
          balance_adjustment_keys: { $ne: `missing-game-refund:${roomId}` },
        },
        {
          $inc: { balance: 10 },
          $addToSet: { balance_adjustment_keys: `missing-game-refund:${roomId}` },
        },
        { new: true },
      );
    }
    expect(roomModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ _id: roomId, status: 'started' }),
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'finished',
          winner_reason: 'start_state_missing_refunded',
        }),
      }),
      { new: true },
    );
    expect(roomsGateway.broadcastRoomUpdate).toHaveBeenCalledWith(
      gameId.toString(),
      'roomUpdated',
      expect.objectContaining({ status: 'finished' }),
    );
  });

  it('does not touch a healthy room or unsupported naval battle room', async () => {
    const healthy = {
      _id: new Types.ObjectId(),
      status: 'started',
      game_ready_at: new Date(),
      game_id: { _id: new Types.ObjectId(), socket_code: 'uno' },
      players: [],
    };
    const naval = {
      ...healthy,
      _id: new Types.ObjectId(),
      game_id: { _id: new Types.ObjectId(), socket_code: 'naval-battle' },
    };
    const roomModel = {
      find: jest.fn(() => new Query([healthy, naval])),
      findOneAndUpdate: jest.fn(),
    };
    const healthyModel = { exists: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }) };
    const service = new MissingGameRecoveryService(
      roomModel as any,
      { findOneAndUpdate: jest.fn(), exists: jest.fn() } as any,
      healthyModel as any,
      healthyModel as any,
      healthyModel as any,
      healthyModel as any,
      healthyModel as any,
      { broadcastRoomUpdate: jest.fn() } as any,
    );

    await service.reconcile();

    expect(roomModel.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
