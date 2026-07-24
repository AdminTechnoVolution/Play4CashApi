/**
 * Waiting-room sync helpers — DB is source of truth for player count; socket.io
 * room membership can lag (simultaneous joins, reconnect flaps). Without this,
 * both players can sit on waitingForOpponent when room.players.length === 2.
 */

import * as fs from 'fs';

const DEBUG_LOG = '/Users/darricordoba/Documents/GitHub/Play4CashPWA/.cursor/debug-83380c.log';
const DEBUG_SESSION_ID = '83380c';

/**
 * Bounded server-side protection for a player who misses the initial private
 * game payload. The PWA retries at 10s, so 20s leaves a second recovery window
 * without allowing a room to remain stalled indefinitely.
 */
export const INITIAL_STATE_RECOVERY_GRACE_SECONDS = 20;

export function initialTurnDeadlineSeconds(turnSeconds: number): number {
  return turnSeconds + INITIAL_STATE_RECOVERY_GRACE_SECONDS;
}

/** Foldable debug telemetry for socket race / forfeit-miss investigations. */
export function agentDebugLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string,
): void {
  try {
    fs.appendFileSync(
      DEBUG_LOG,
      `${JSON.stringify({
        sessionId: DEBUG_SESSION_ID,
        location,
        message,
        data,
        hypothesisId,
        timestamp: Date.now(),
      })}\n`,
    );
  } catch {
    /* ignore */
  }
}

/** Terminal state payload for clients that re-join after forfeit/abandon. */
export function buildFinishedRoomSyncData(
  room: { winner?: { toString(): string } | null; winner_reason?: string | null },
  playerId: string,
): {
  gameEnded: true;
  outcome: string;
  youWon: boolean;
  winner: string;
  waitingForOpponent: false;
  gameStarted: false;
} {
  const winnerId = room.winner?.toString() ?? '';
  return {
    gameEnded: true,
    outcome: room.winner_reason || 'finished',
    youWon: winnerId === playerId,
    winner: winnerId,
    waitingForOpponent: false,
    gameStarted: false,
  };
}

const reconcileTimers = new Map<string, ReturnType<typeof setTimeout>>();

/** Debounced re-check so simultaneous join handlers both get a second chance to start. */
export function scheduleWaitingRoomReconcile(
  roomId: string,
  fn: () => void | Promise<void>,
  delayMs = 350,
): void {
  const prev = reconcileTimers.get(roomId);
  if (prev) clearTimeout(prev);
  reconcileTimers.set(
    roomId,
    setTimeout(() => {
      reconcileTimers.delete(roomId);
      void fn();
    }, delayMs),
  );
}

/** Wait briefly for the lease owner to publish durable private game state. */
export async function waitForGameDocument(
  gameModel: { findOne(filter: Record<string, unknown>): PromiseLike<any> },
  roomId: string,
  attempts = 20,
  delayMs = 50,
): Promise<any | null> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const game = await gameModel.findOne({ room_id: roomId });
    if (game) return game;
    if (attempt + 1 < attempts) {
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return null;
}

export async function emitDbOpponentJoinedIfPresent(options: {
  room: { status: string; players: Array<{ playerId: { toString(): string } }> };
  joiningPlayerId: string;
  getUsername: (userId: string) => Promise<string>;
  notifyJoiner: (opponentName: string) => void;
  notifyOthers: (joinerName: string) => void;
}): Promise<void> {
  if (options.room.status !== 'waiting') return;
  if (options.room.players.length < 2) return;

  const opponent = options.room.players.find(
    (p) => p.playerId.toString() !== options.joiningPlayerId,
  );
  if (!opponent?.playerId) return;

  const [oppName, joinerName] = await Promise.all([
    options.getUsername(opponent.playerId.toString()),
    options.getUsername(options.joiningPlayerId),
  ]);

  options.notifyJoiner(oppName);
  options.notifyOthers(joinerName);
}
