/**
 * Phase A — `tryStartUnoGame` compensation contract.
 *
 * We can't easily instantiate the whole UnoGateway, so this spec exercises the
 * compensation rule against the same patterns used inside `tryStartUnoGame`: when any
 * step after deduction fails (deal throws, model.create throws, model.create returns
 * null), the `compensate(reason, errKey)` flow must:
 *   1. Refund every paid player by `bet_amount`.
 *   2. Delete any partial game document.
 *   3. Reset room status to `waiting`.
 *   4. Emit a failure message to the room.
 *
 * The inline `compensate` below mirrors the production helper line-for-line.
 */
import { Types } from 'mongoose';

function makeCompensate(deps: {
  userModel: { updateOne: jest.Mock };
  unoModel: { deleteOne: jest.Mock };
  roomModel: { findByIdAndUpdate: jest.Mock };
  emitToRoom: jest.Mock;
}) {
  return async function compensate(
    room_id: string,
    paid: Types.ObjectId[],
    bet_amount: number,
    errKey: string,
  ) {
    for (const pid of paid) {
      await deps.userModel
        .updateOne({ _id: pid }, { $inc: { balance: bet_amount } })
        .catch(() => {});
    }
    await deps.unoModel
      .deleteOne({ room_id: new Types.ObjectId(room_id) })
      .catch(() => {});
    await deps.roomModel
      .findByIdAndUpdate(room_id, { $set: { status: 'waiting' } })
      .catch(() => {});
    deps.emitToRoom(room_id, { success: false, messages: [errKey] });
  };
}

describe('tryStartUnoGame compensation (Phase A)', () => {
  it('refunds every paid player, deletes the game doc, and reverts status when invoked', async () => {
    const deps = {
      userModel: { updateOne: jest.fn().mockResolvedValue({}) },
      unoModel: { deleteOne: jest.fn().mockResolvedValue({}) },
      roomModel: { findByIdAndUpdate: jest.fn().mockResolvedValue({}) },
      emitToRoom: jest.fn(),
    };

    const compensate = makeCompensate(deps);
    const roomId = new Types.ObjectId().toString();
    const p1 = new Types.ObjectId();
    const p2 = new Types.ObjectId();

    await compensate(roomId, [p1, p2], 25, 'ws.games.matchmakingError');

    expect(deps.userModel.updateOne).toHaveBeenCalledTimes(2);
    expect(deps.userModel.updateOne).toHaveBeenNthCalledWith(
      1,
      { _id: p1 },
      { $inc: { balance: 25 } },
    );
    expect(deps.userModel.updateOne).toHaveBeenNthCalledWith(
      2,
      { _id: p2 },
      { $inc: { balance: 25 } },
    );
    expect(deps.unoModel.deleteOne).toHaveBeenCalledTimes(1);
    expect(deps.roomModel.findByIdAndUpdate).toHaveBeenCalledWith(
      roomId,
      { $set: { status: 'waiting' } },
    );
    expect(deps.emitToRoom).toHaveBeenCalledWith(
      roomId,
      expect.objectContaining({ success: false }),
    );
  });

  it('is a no-op on refunds when no player was paid yet (deal failed before any deduction succeeded)', async () => {
    const deps = {
      userModel: { updateOne: jest.fn().mockResolvedValue({}) },
      unoModel: { deleteOne: jest.fn().mockResolvedValue({}) },
      roomModel: { findByIdAndUpdate: jest.fn().mockResolvedValue({}) },
      emitToRoom: jest.fn(),
    };

    const compensate = makeCompensate(deps);
    const roomId = new Types.ObjectId().toString();

    await compensate(roomId, [], 25, 'ws.games.insufficientBalance');

    expect(deps.userModel.updateOne).not.toHaveBeenCalled();
    expect(deps.unoModel.deleteOne).toHaveBeenCalled();
    expect(deps.roomModel.findByIdAndUpdate).toHaveBeenCalled();
  });

  it('continues compensating even if one refund throws (partial recovery beats none)', async () => {
    const deps = {
      userModel: {
        updateOne: jest
          .fn()
          .mockRejectedValueOnce(new Error('mongo down'))
          .mockResolvedValueOnce({}),
      },
      unoModel: { deleteOne: jest.fn().mockResolvedValue({}) },
      roomModel: { findByIdAndUpdate: jest.fn().mockResolvedValue({}) },
      emitToRoom: jest.fn(),
    };

    const compensate = makeCompensate(deps);
    const roomId = new Types.ObjectId().toString();
    const p1 = new Types.ObjectId();
    const p2 = new Types.ObjectId();

    await compensate(roomId, [p1, p2], 10, 'ws.games.matchmakingError');

    // Both refund attempts were issued, the second succeeded, and the cleanup paths
    // (deleteOne + status reset + emit) still ran.
    expect(deps.userModel.updateOne).toHaveBeenCalledTimes(2);
    expect(deps.unoModel.deleteOne).toHaveBeenCalled();
    expect(deps.roomModel.findByIdAndUpdate).toHaveBeenCalled();
    expect(deps.emitToRoom).toHaveBeenCalled();
  });

  it('refund amount equals the original bet, no fee deducted (refunds are full)', async () => {
    const deps = {
      userModel: { updateOne: jest.fn().mockResolvedValue({}) },
      unoModel: { deleteOne: jest.fn().mockResolvedValue({}) },
      roomModel: { findByIdAndUpdate: jest.fn().mockResolvedValue({}) },
      emitToRoom: jest.fn(),
    };
    const compensate = makeCompensate(deps);
    const p = new Types.ObjectId();

    await compensate(new Types.ObjectId().toString(), [p], 100, 'x');

    expect(deps.userModel.updateOne).toHaveBeenCalledWith(
      { _id: p },
      { $inc: { balance: 100 } }, // positive == full refund
    );
  });
});
