/**
 * Phase A — atomic `leaveRoom` STARTED → forfeit guard.
 *
 * The full `RoomService.leaveRoom` has a heavy dependency graph (5 gateways, multiple
 * models, i18n). We isolate the new atomic-finalization pattern by reproducing the
 * exact branch logic against jest mocks: two concurrent leaveRoom calls on the same
 * STARTED 1v1 room must only credit the winner once.
 */
import { Types } from 'mongoose';
import { calculateWinnerSettlement, winnerBalanceUpdate } from '../../common/utils/game-prize.util';

type RoomLike = {
  _id: Types.ObjectId;
  status: 'waiting' | 'started' | 'finished';
  players: { playerId: Types.ObjectId }[];
  bet_amount: number;
  house_edge: number;
};

/** Inline copy of the post-fix finalize block — `roomModel.findOneAndUpdate` atomic. */
function makeForfeit(roomModel: { findOneAndUpdate: jest.Mock }, userModel: { updateOne: jest.Mock }) {
  return async function tryForfeit(roomId: Types.ObjectId, room: RoomLike, leavingUserId: string) {
    const winner_id = room.players.find((p) => p.playerId.toString() !== leavingUserId)?.playerId;
    if (!winner_id) return 'no_winner';

    const finalized = await roomModel.findOneAndUpdate(
      { _id: roomId, status: 'started' },
      {
        $set: {
          status: 'finished',
          winner: winner_id,
          winner_reason: 'forfeit',
          finished_at: new Date(),
        },
      },
      { returnDocument: 'after' },
    );
    if (!finalized) return 'already_finalized';

    const settlement = calculateWinnerSettlement(
      room.bet_amount,
      room.house_edge,
      room.players.length,
    );
    await userModel.updateOne({ _id: winner_id }, winnerBalanceUpdate(settlement));
    return 'paid_out';
  };
}

describe('leaveRoom STARTED → forfeit atomicity (Phase A)', () => {
  it('credits the winner exactly once when the same forfeit is attempted twice serially', async () => {
    const roomModel = { findOneAndUpdate: jest.fn() };
    const userModel = { updateOne: jest.fn().mockResolvedValue({}) };

    const roomId = new Types.ObjectId();
    const winnerId = new Types.ObjectId();
    const loserId = new Types.ObjectId();
    const room: RoomLike = {
      _id: roomId,
      status: 'started',
      players: [{ playerId: loserId }, { playerId: winnerId }],
      bet_amount: 10,
      house_edge: 10,
    };

    // First call wins the lock; second call's findOneAndUpdate sees status=finished → null.
    roomModel.findOneAndUpdate
      .mockResolvedValueOnce({ _id: roomId, status: 'finished', winner: winnerId })
      .mockResolvedValueOnce(null);

    const forfeit = makeForfeit(roomModel, userModel);
    const r1 = await forfeit(roomId, room, loserId.toString());
    const r2 = await forfeit(roomId, room, loserId.toString());

    expect(r1).toBe('paid_out');
    expect(r2).toBe('already_finalized');
    expect(userModel.updateOne).toHaveBeenCalledTimes(1);
    expect(userModel.updateOne).toHaveBeenCalledWith(
      { _id: winnerId },
      { $inc: { balance: 19, total_won: 9 } },
    );
  });

  it('credits the winner exactly once under concurrent forfeit attempts (Promise.all)', async () => {
    const roomModel = { findOneAndUpdate: jest.fn() };
    const userModel = { updateOne: jest.fn().mockResolvedValue({}) };

    const roomId = new Types.ObjectId();
    const winnerId = new Types.ObjectId();
    const loserId = new Types.ObjectId();
    const room: RoomLike = {
      _id: roomId,
      status: 'started',
      players: [{ playerId: loserId }, { playerId: winnerId }],
      bet_amount: 5,
      house_edge: 0,
    };

    roomModel.findOneAndUpdate
      .mockResolvedValueOnce({ _id: roomId, status: 'finished', winner: winnerId })
      .mockResolvedValueOnce(null);

    const forfeit = makeForfeit(roomModel, userModel);
    const results = await Promise.all([
      forfeit(roomId, room, loserId.toString()),
      forfeit(roomId, room, loserId.toString()),
    ]);

    expect(results.sort()).toEqual(['already_finalized', 'paid_out']);
    expect(userModel.updateOne).toHaveBeenCalledTimes(1);
  });

  it('does not pay out if the leaving user has no opponent on the players list (degenerate)', async () => {
    const roomModel = { findOneAndUpdate: jest.fn() };
    const userModel = { updateOne: jest.fn().mockResolvedValue({}) };

    const roomId = new Types.ObjectId();
    const onlyId = new Types.ObjectId();
    const room: RoomLike = {
      _id: roomId,
      status: 'started',
      players: [{ playerId: onlyId }],
      bet_amount: 10,
      house_edge: 0,
    };

    const forfeit = makeForfeit(roomModel, userModel);
    const result = await forfeit(roomId, room, onlyId.toString());

    expect(result).toBe('no_winner');
    expect(roomModel.findOneAndUpdate).not.toHaveBeenCalled();
    expect(userModel.updateOne).not.toHaveBeenCalled();
  });
});
