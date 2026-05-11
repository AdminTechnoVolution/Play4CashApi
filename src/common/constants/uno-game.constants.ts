/** WebSocket namespace / catalog socket_code for UNO (Phase 1+). */
export const UNO_SOCKET_CODE = 'uno';

/** Allowed table sizes: even counts from 2 through 10. */
export const UNO_ALLOWED_PLAYER_COUNTS: readonly number[] = [2, 4, 6, 8, 10];

export function isValidUnoPlayerCount(n: number): boolean {
  return UNO_ALLOWED_PLAYER_COUNTS.includes(n);
}
