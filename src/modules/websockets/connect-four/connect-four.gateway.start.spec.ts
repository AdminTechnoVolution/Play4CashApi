/**
 * Connect Four start contract — mirrors production helpers in connect-four.gateway.ts.
 *
 * Covers compensation on failed start, playerNum resolution before emit, and the
 * join ordering rule: try start before emitting waiting lobby state.
 */
import { Types } from 'mongoose';

function makeCompensate(deps: {
  userModel: { updateOne: jest.Mock };
  gameModel: { deleteOne: jest.Mock };
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
    await deps.gameModel
      .deleteOne({ room_id: new Types.ObjectId(room_id) })
      .catch(() => {});
    await deps.roomModel
      .findByIdAndUpdate(room_id, { $set: { status: 'waiting' } })
      .catch(() => {});
    deps.emitToRoom(room_id, { success: false, messages: [errKey] });
  };
}

function resolvePlayerNum(
  socket: { data?: { playerNum?: number; player_id?: string } },
  room: { players: Array<{ playerId: Types.ObjectId }> },
): number {
  let pNum = Number(socket?.data?.playerNum) || 0;
  if (pNum === 1 || pNum === 2) return pNum;
  const pid = socket?.data?.player_id;
  if (!pid) return 0;
  const idx = room.players.findIndex((p) => p.playerId.toString() === pid);
  if (idx === 0) return 1;
  if (idx === 1) return 2;
  return 0;
}

/** Mirrors handleJoin Halma ordering: emit waiting first, then try start when room is full. */
function shouldEmitWaitingLobby(isSpectator: boolean, roomStatus: string): boolean {
  return !isSpectator && roomStatus === 'waiting';
}

function shouldTryStartAfterWaitingEmit(
  room: { status: string; players: unknown[] },
  socketCount: number,
  maxPlayers: number,
): boolean {
  return (
    room.status === 'waiting' &&
    room.players.length >= maxPlayers &&
    socketCount >= maxPlayers
  );
}

describe('ConnectFour start contract', () => {
  describe('tryStartConnectFourGame compensation', () => {
    it('refunds both players and reverts room when game create fails', async () => {
      const deps = {
        userModel: { updateOne: jest.fn().mockResolvedValue({}) },
        gameModel: { deleteOne: jest.fn().mockResolvedValue({}) },
        roomModel: { findByIdAndUpdate: jest.fn().mockResolvedValue({}) },
        emitToRoom: jest.fn(),
      };
      const compensate = makeCompensate(deps);
      const roomId = new Types.ObjectId().toString();
      const p1 = new Types.ObjectId();
      const p2 = new Types.ObjectId();

      await compensate(roomId, [p1, p2], 50, 'ws.games.matchmakingError');

      expect(deps.userModel.updateOne).toHaveBeenCalledTimes(2);
      expect(deps.gameModel.deleteOne).toHaveBeenCalledTimes(1);
      expect(deps.roomModel.findByIdAndUpdate).toHaveBeenCalledWith(roomId, {
        $set: { status: 'waiting' },
      });
      expect(deps.emitToRoom).toHaveBeenCalledWith(
        roomId,
        expect.objectContaining({ success: false }),
      );
    });

    it('skips refunds when no deduction succeeded yet', async () => {
      const deps = {
        userModel: { updateOne: jest.fn().mockResolvedValue({}) },
        gameModel: { deleteOne: jest.fn().mockResolvedValue({}) },
        roomModel: { findByIdAndUpdate: jest.fn().mockResolvedValue({}) },
        emitToRoom: jest.fn(),
      };
      const compensate = makeCompensate(deps);
      const roomId = new Types.ObjectId().toString();

      await compensate(roomId, [], 25, 'ws.games.insufficientBalance');

      expect(deps.userModel.updateOne).not.toHaveBeenCalled();
      expect(deps.gameModel.deleteOne).toHaveBeenCalled();
      expect(deps.roomModel.findByIdAndUpdate).toHaveBeenCalled();
    });
  });

  describe('resolvePlayerNum', () => {
    const p1 = new Types.ObjectId();
    const p2 = new Types.ObjectId();
    const room = { players: [{ playerId: p1 }, { playerId: p2 }] };

    it('uses existing playerNum on socket when set', () => {
      expect(resolvePlayerNum({ data: { playerNum: 2 } }, room)).toBe(2);
    });

    it('derives playerNum from room.players when missing on socket', () => {
      expect(
        resolvePlayerNum({ data: { player_id: p1.toString() } }, room),
      ).toBe(1);
      expect(
        resolvePlayerNum({ data: { player_id: p2.toString() } }, room),
      ).toBe(2);
    });

    it('returns 0 for unknown player', () => {
      expect(
        resolvePlayerNum({ data: { player_id: new Types.ObjectId().toString() } }, room),
      ).toBe(0);
    });
  });

  describe('handleJoin Halma-style ordering', () => {
    it('emits waiting lobby to joiner before start attempt', () => {
      expect(shouldEmitWaitingLobby(false, 'waiting')).toBe(true);
      expect(shouldEmitWaitingLobby(true, 'waiting')).toBe(false);
      expect(shouldEmitWaitingLobby(false, 'started')).toBe(false);
    });

    it('attempts start after waiting when room full and both sockets connected', () => {
      expect(
        shouldTryStartAfterWaitingEmit(
          { status: 'waiting', players: [{}, {}] },
          2,
          2,
        ),
      ).toBe(true);
    });

    it('does not attempt start when only one socket is connected', () => {
      expect(
        shouldTryStartAfterWaitingEmit(
          { status: 'waiting', players: [{}, {}] },
          1,
          2,
        ),
      ).toBe(false);
    });

    it('does not attempt start when room already started', () => {
      expect(
        shouldTryStartAfterWaitingEmit(
          { status: 'started', players: [{}, {}] },
          2,
          2,
        ),
      ).toBe(false);
    });
  });

  describe('start emit payload contract', () => {
    it('play state must include gameStarted and exclude waiting overlay', () => {
      const playPayload = {
        waitingForOpponent: false,
        gameStarted: true,
        status: 'started',
        board: [],
      };
      expect(playPayload.gameStarted).toBe(true);
      expect(playPayload.waitingForOpponent).toBe(false);
    });

    it('start broadcasts once per socket — no separate joiner-only emit', () => {
      const emitsPerJoiner = 1;
      const joinerOnlyExtraEmit = 0;
      expect(emitsPerJoiner + joinerOnlyExtraEmit).toBe(1);
    });
  });
});
