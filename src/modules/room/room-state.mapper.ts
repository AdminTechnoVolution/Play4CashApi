import { RoomStatus } from './schemas/room.schema';

export interface AuthoritativeRoomState {
  roomId: string;
  gameId: string;
  gameSocketCode: string;
  status: string;
  players: Array<{ id: string; username: string }>;
  currentPlayers: number;
  requiredPlayers: number;
  isCurrentUserInRoom: boolean;
  canEnterPlay: boolean;
  playPath: string | null;
  betAmount: number;
  roomName: string;
  updatedAt: Date | string | null;
  startedAt: Date | string | null;
}

export function buildAuthoritativeRoomState(
  room: any,
  userId: string,
): AuthoritativeRoomState {
  const requiredPlayers =
    room.player_limit || room.game_id?.max_players || room.game_id?.maxPlayers || 2;
  const players = (room.players || []).map((player: any) => {
    const ref = player.playerId || player;
    return {
      id: String(ref?._id || ref?.id || ref || ''),
      username: ref?.username || '',
    };
  });
  const isCurrentUserInRoom = players.some((player: any) => player.id === userId);
  const gameSocketCode =
    room.game_id?.socket_code || room.game_id?.socketCode || '';

  return {
    roomId: String(room._id || room.id || ''),
    gameId: String(room.game_id?._id || room.game_id?.id || room.game_id || ''),
    gameSocketCode,
    status: room.status,
    players,
    currentPlayers: players.length,
    requiredPlayers,
    isCurrentUserInRoom,
    canEnterPlay: room.status === RoomStatus.STARTED && isCurrentUserInRoom,
    playPath: gameSocketCode ? `/play/${gameSocketCode}` : null,
    betAmount: room.bet_amount || 0,
    roomName: room.name || '',
    updatedAt: room.updated_at || room.started_at || room.created_at || null,
    startedAt: room.started_at || null,
  };
}
