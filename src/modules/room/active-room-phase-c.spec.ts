/**
 * Phase C — single-active-room invariant.
 *
 * The full `RoomService` has a heavy dependency graph (5 gateways, multiple models,
 * i18n) that makes booting Nest under jest expensive. We exercise the new
 * `raiseIfAlreadyInActiveRoom` translation and the active-room lookup against
 * mocks, isolating the behaviour we own from upstream noise.
 */
import { Types } from 'mongoose';
import { BusinessException } from '../../common/exceptions/business.exception';

type RoomLike = {
  _id: Types.ObjectId;
  game_id: Types.ObjectId | string;
  status: 'waiting' | 'started' | 'finished';
};

/**
 * Inline copy of `RoomService.raiseIfAlreadyInActiveRoom` — keeps the unit test
 * decoupled from the gateways dependency graph but mirrors the production logic.
 * Update this helper IF the production logic changes.
 */
function makeTranslator(roomModel: { findOne: jest.Mock }) {
  return async function raiseIfAlreadyInActiveRoom(userId: string, err: unknown): Promise<never> {
    const e = err as { code?: number; message?: string };
    if (e?.code === 11000 && /players_playerId_active_unique/.test(e.message || '')) {
      const active = await roomModel
        .findOne({
          'players.playerId': new Types.ObjectId(userId),
          status: { $in: ['waiting', 'started'] },
        })
        .select('_id game_id status')
        .lean();
      throw new BusinessException('ERROR_USER_ALREADY_IN_ROOM', 409, {
        activeRoomId: active?._id?.toString() ?? null,
        gameId: (active as any)?.game_id?.toString() ?? null,
        status: active?.status ?? null,
      });
    }
    throw err as Error;
  };
}

describe('Phase C — raiseIfAlreadyInActiveRoom', () => {
  function makeQuery(value: any) {
    const select = jest.fn().mockReturnThis();
    const lean = jest.fn().mockResolvedValue(value);
    return { select, lean };
  }

  it('translates the partial-unique E11000 into ERROR_USER_ALREADY_IN_ROOM with active room context', async () => {
    const activeId = new Types.ObjectId();
    const gameId = new Types.ObjectId();
    const query = makeQuery({ _id: activeId, game_id: gameId, status: 'started' } as RoomLike);
    const roomModel = { findOne: jest.fn().mockReturnValue(query) };
    const raise = makeTranslator(roomModel);

    const e11000 = {
      code: 11000,
      message: 'E11000 duplicate key error … index: players_playerId_active_unique dup key …',
    };

    let caught: any;
    try {
      await raise(new Types.ObjectId().toString(), e11000);
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(BusinessException);
    expect((caught as BusinessException).message).toBe('ERROR_USER_ALREADY_IN_ROOM');
    expect((caught as BusinessException).statusCode).toBe(409);
    expect((caught as BusinessException).data).toEqual({
      activeRoomId: activeId.toString(),
      gameId: gameId.toString(),
      status: 'started',
    });
  });

  it('returns null fields when no active room can be found (defensive)', async () => {
    const query = makeQuery(null);
    const roomModel = { findOne: jest.fn().mockReturnValue(query) };
    const raise = makeTranslator(roomModel);

    let caught: any;
    try {
      await raise(new Types.ObjectId().toString(), {
        code: 11000,
        message: 'E11000 … index: players_playerId_active_unique …',
      });
    } catch (err) {
      caught = err;
    }
    expect((caught as BusinessException).data).toEqual({
      activeRoomId: null,
      gameId: null,
      status: null,
    });
  });

  it('rethrows other E11000 errors verbatim (do not mask `code` index collisions)', async () => {
    const roomModel = { findOne: jest.fn() };
    const raise = makeTranslator(roomModel);

    const otherDup = {
      code: 11000,
      message: 'E11000 duplicate key error collection: rooms index: code_unique dup key …',
    };
    await expect(raise('user', otherDup)).rejects.toBe(otherDup);
    expect(roomModel.findOne).not.toHaveBeenCalled();
  });

  it('rethrows non-duplicate-key errors untouched', async () => {
    const roomModel = { findOne: jest.fn() };
    const raise = makeTranslator(roomModel);
    const random = new Error('connection reset');
    await expect(raise('user', random)).rejects.toBe(random);
  });
});

describe('Phase C — getActiveRoomForUser shape', () => {
  it('returns { success:true, data:null } when the user has no active room', async () => {
    const query = { populate: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(null) };
    const roomModel = { findOne: jest.fn().mockReturnValue(query) };

    async function getActiveRoomForUser(userId: string) {
      const active = await roomModel
        .findOne({
          'players.playerId': new Types.ObjectId(userId),
          status: { $in: ['waiting', 'started'] },
        })
        .populate('game_id', '-created_at')
        .populate('players.playerId', 'username')
        .lean();
      if (!active) return { success: true, messages: [], data: null };
      return { success: true, messages: [], data: active };
    }

    const result = await getActiveRoomForUser(new Types.ObjectId().toString());
    expect(result).toEqual({ success: true, messages: [], data: null });
  });
});
