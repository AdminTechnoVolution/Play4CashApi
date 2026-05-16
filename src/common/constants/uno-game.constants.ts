/** WebSocket namespace / catalog socket_code for UNO (Phase 1+). */
export const UNO_SOCKET_CODE = 'uno';

/** Mattel-style match target is often 500; mobile pacing default 200. Clamped for DB + env. */
export const UNO_MATCH_TARGET_MIN = 50;
export const UNO_MATCH_TARGET_MAX = 500;
export const UNO_MATCH_TARGET_DEFAULT = 200;

/** Allowed table sizes: even counts from 2 through 10. */
export const UNO_ALLOWED_PLAYER_COUNTS: readonly number[] = [2, 4, 6, 8, 10];

export function isValidUnoPlayerCount(n: number): boolean {
  return UNO_ALLOWED_PLAYER_COUNTS.includes(n);
}

export function clampUnoMatchTarget(n: number): number {
  return Math.max(UNO_MATCH_TARGET_MIN, Math.min(UNO_MATCH_TARGET_MAX, n));
}

/**
 * Order: `Game.uno_match_target` (catalog / admin) → `UNO_MATCH_TARGET` env → default.
 * Env remains a deployment fallback when the catalog field is unset.
 */
export function resolveUnoMatchTarget(catalogTarget: unknown, envRaw: string | undefined): number {
  const fromDb =
    typeof catalogTarget === 'number' && Number.isFinite(catalogTarget) ? catalogTarget : null;
  const parsedEnv = Number(envRaw);
  const base =
    fromDb ??
    (Number.isFinite(parsedEnv) && parsedEnv > 0 ? parsedEnv : UNO_MATCH_TARGET_DEFAULT);
  return clampUnoMatchTarget(base);
}
