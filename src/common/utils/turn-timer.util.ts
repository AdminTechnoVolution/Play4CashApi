import type { RoomDocument } from '../../modules/room/schemas/room.schema';
import type { GameDocument } from '../../modules/game/schemas/game.schema';

export function resolveTurnTimerSeconds(
  room: Pick<RoomDocument, 'turn_timer_seconds'>,
  game: Pick<GameDocument, 'turn_timer_seconds'>,
): number {
  return room.turn_timer_seconds ?? game.turn_timer_seconds ?? 30;
}
