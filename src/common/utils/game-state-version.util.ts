/** Monotonic game-state version + server turn deadline helpers for WS payloads. */

export async function bumpGameStateVersion(
  redis: { incr: (k: string) => Promise<number>; expire: (k: string, s: number) => Promise<unknown> },
  game: string,
  roomId: string,
): Promise<number> {
  const key = `gameStateVersion:${game}:${roomId}`;
  const v = await redis.incr(key);
  await redis.expire(key, 86_400);
  return Number(v);
}

export function computeTurnDeadlineAt(
  turnStart: Date | string | null | undefined,
  timerSeconds: number,
): string | null {
  if (!turnStart || !timerSeconds || timerSeconds <= 0) return null;
  const t = turnStart instanceof Date ? turnStart.getTime() : Date.parse(String(turnStart));
  if (!Number.isFinite(t)) return null;
  return new Date(t + timerSeconds * 1000).toISOString();
}

export async function enrichGamePayload(
  redis: { incr: (k: string) => Promise<number>; expire: (k: string, s: number) => Promise<unknown> },
  game: string,
  roomId: string,
  data: Record<string, unknown>,
  opts?: { turnStart?: Date | string | null; timerSeconds?: number },
): Promise<Record<string, unknown>> {
  const stateVersion = await bumpGameStateVersion(redis, game, roomId);
  const turnDeadlineAt = computeTurnDeadlineAt(opts?.turnStart ?? null, opts?.timerSeconds ?? 0);
  return {
    ...data,
    stateVersion,
    ...(turnDeadlineAt ? { turnDeadlineAt } : {}),
  };
}
