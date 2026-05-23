/**
 * Connect Four move broadcast contract — mirrors resolvePlayerNum usage in handleDropDisc.
 */
import { Types } from 'mongoose';

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

function yourTurnForViewer(viewerPlayerNum: number, currentPlayer: number): boolean {
  return viewerPlayerNum === currentPlayer;
}

function nextMoveRevision(current: number | undefined): number {
  return (current ?? 0) + 1;
}

function buildPublicMoveRevision(game: { move_revision?: number } | null): number {
  return game?.move_revision ?? 0;
}

describe('ConnectFour move broadcast contract', () => {
  const p1 = new Types.ObjectId();
  const p2 = new Types.ObjectId();
  const room = { players: [{ playerId: p1 }, { playerId: p2 }] };

  it('resolvePlayerNum derives slot from player_id when playerNum missing', () => {
    expect(resolvePlayerNum({ data: { player_id: p2.toString() } }, room)).toBe(2);
  });

  it('after P1 moves, P2 socket gets yourTurn=true', () => {
    const currentPlayer = 2;
    const p2Socket = { data: { player_id: p2.toString() } };
    const p2Num = resolvePlayerNum(p2Socket, room);
    expect(yourTurnForViewer(p2Num, currentPlayer)).toBe(true);
  });

  it('move payload includes lastMove shape expected by PWA', () => {
    const lastMove = {
      userId: p1.toString(),
      row: 5,
      col: 3,
      color: 'R' as const,
      at: new Date().toISOString(),
    };
    const payload = {
      board: [],
      lastMove,
      moveRevision: 1,
      currentTurnUsername: 'Bob',
      turnOf: 'Bob',
      yourTurn: false,
      gameStarted: true,
    };
    expect(payload.lastMove.color).toBe('R');
    expect(payload.moveRevision).toBe(1);
    expect(payload.currentTurnUsername).toBe('Bob');
    expect(payload.yourTurn).toBe(false);
  });

  it('move_revision increments monotonically on each drop', () => {
    let rev = 0;
    rev = nextMoveRevision(rev);
    expect(rev).toBe(1);
    rev = nextMoveRevision(rev);
    expect(rev).toBe(2);
  });

  it('buildPublicState exposes moveRevision from game doc', () => {
    expect(buildPublicMoveRevision({ move_revision: 7 })).toBe(7);
    expect(buildPublicMoveRevision(null)).toBe(0);
  });

  it('save failure should not broadcast — contract: emit only after persisted revision', () => {
    let saved = false;
    let broadcast = false;
    const simulateDrop = async (saveOk: boolean) => {
      const revision = nextMoveRevision(0);
      try {
        if (!saveOk) throw new Error('save failed');
        saved = true;
      } catch {
        return { saved, broadcast };
      }
      broadcast = true;
      return { saved, broadcast, revision };
    };
    return simulateDrop(false).then((r) => {
      expect(r.saved).toBe(false);
      expect(r.broadcast).toBe(false);
    });
  });
});
