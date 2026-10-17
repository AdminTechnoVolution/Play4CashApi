import { Connection, Types } from 'mongoose';
import { commandContext } from '../reliable-commands/context';
import { settleGameRoom } from '../../modules/payments/game-finance';

export const MATCH_PREPARATION_MS = 60_000;
export const MATCH_COUNTDOWN_MS = 1_500;
export const GAME_COLLECTIONS: Record<string, string> = {
  chess: 'chessgames', halma: 'halmagames', domino: 'dominogames',
  uno: 'unogames', 'connect-four': 'connectfourgames',
};
export const gameCode = (code: string) => code === 'battleship' ? 'naval-battle' : code === 'connect4' ? 'connect-four' : code;
export function isPreparing(room: any): boolean {
  return room?.start_protocol === 1 && !room.play_started_at && room.status !== 'finished';
}
export function canPlay(room: any, now = Date.now()): boolean {
  return room?.start_protocol !== 1 || (room.status === 'started' && !!room.play_started_at && new Date(room.play_started_at).getTime() <= now);
}
export function startState(room: any) {
  return { roomId: String(room._id), protocol: room.start_protocol ?? 0,
    phase: room.status === 'finished' ? 'finished' : room.play_started_at ? 'active' : room.start_protocol === 1 ? 'preparing' : 'legacy',
    startsAt: room.play_started_at ? new Date(room.play_started_at).toISOString() : null,
    serverNow: new Date().toISOString(), reason: room.winner_reason ?? null };
}

/**
 * The room id identifies one immutable prepared game. No moves are allowed before this barrier.
 * `pending` lists the players the barrier still waits for, so the caller can ask them to resync.
 */
export async function acknowledgeInitialState(db: Connection, namespace: string, actor: string, roomId: string)
  : Promise<{ state: ReturnType<typeof startState>; pending: string[] }> {
  if (!Types.ObjectId.isValid(roomId) || !Types.ObjectId.isValid(actor)) throw new Error('INVALID_MATCH_ACK');
  return db.transaction(async session => {
    const rooms = db.collection('rooms');
    const room = await rooms.findOne({ _id: new Types.ObjectId(roomId), 'players.playerId': new Types.ObjectId(actor) }, { session });
    if (!room) throw new Error('MATCH_NOT_FOUND');
    const catalog = await db.collection('games').findOne({ _id: room.game_id }, { session });
    const code = gameCode(catalog?.socket_code);
    if (namespace !== `/${code}`) throw new Error('WRONG_GAME_NAMESPACE');
    if (!isPreparing(room)) return { state: startState(room), pending: [] };
    if (!room.game_ready_at || new Date(room.preparation_deadline_at).getTime() <= Date.now()) return { state: startState(room), pending: [] };
    const now = new Date();
    // Writing the room serializes simultaneous acknowledgements and cancellation across replicas.
    await rooms.updateOne({ _id: room._id, 'players.playerId': new Types.ObjectId(actor) },
      { $set: { 'players.$.initial_state_ack_at': now } }, { session });
    const players = room.players.map((p: any) => String(p.playerId) === actor ? { ...p, initial_state_ack_at: now } : p);
    const pending = players.filter((p: any) => !p.initial_state_ack_at).map((p: any) => String(p.playerId));
    if (players.length < 2 || pending.length) return { state: startState(room), pending };
    const startsAt = new Date(Date.now() + MATCH_COUNTDOWN_MS);
    const collection = GAME_COLLECTIONS[code];
    const game = collection ? await db.collection(collection).findOne({ room_id: room._id }, { session }) : null;
    if (collection && !game) throw new Error('INITIAL_GAME_STATE_MISSING');
    const currentPlayer = game?.player_ids?.[game.current_player_index ?? 0]
      ?? players[(game?.current_player ?? 1) - 1]?.playerId;
    if (!currentPlayer) throw new Error('INITIAL_PLAYER_MISSING');
    const timerSeconds = Number(room.turn_timer_seconds ?? catalog?.turn_timer_seconds ?? 30);
    await rooms.updateOne({ _id: room._id }, { $set: { play_started_at: startsAt, started_at: startsAt,
      turn_start_time: startsAt }, $inc: { command_revision: 1 } }, { session });
    if (collection) await db.collection(collection).updateOne({ room_id: room._id }, { $set: { turn_start_time: startsAt } }, { session });
    await db.collection('turn_deadlines').updateOne({ game_name: code, room_id: roomId }, { $set: {
      player_id: String(currentPlayer), expires_at: new Date(startsAt.getTime() + timerSeconds * 1000), processing: false,
    } }, { session, upsert: true });
    const state = startState({ ...room, play_started_at: startsAt });
    await db.collection('game_outbox').insertOne({ roomId, sequence: Number(room.command_revision ?? 0) + 1, index: 0,
      published: false, createdAt: now, event: { namespace, rooms: players.map((p: any) => `player:${p.playerId}`),
        except: [], event: 'match_start_state', args: [state] } }, { session });
    return { state, pending: [] };
  });
}

/** Cancels and refunds within the caller's transaction, or creates one for the recovery worker. */
export async function cancelPreparedMatch(db: Connection, roomId: string, expiredOnly = false): Promise<boolean> {
  const work = async (session: any) => {
    const room = await db.collection('rooms').findOne({ _id: new Types.ObjectId(roomId) }, { session });
    if (!room || !isPreparing(room) || (expiredOnly && new Date(room.preparation_deadline_at).getTime() > Date.now())) return false;
    const now = new Date();
    await db.collection('rooms').updateOne({ _id: room._id }, { $set: { status: 'finished', finished_at: now,
      finance_cancelled: true, winner_reason: 'startup_unconfirmed' }, $unset: { winner: 1 }, $inc: { command_revision: 1 } }, { session });
    if (process.env.FINANCE_V2_ENABLED === 'true') {
      await commandContext.run({ session, roomId, version: Number(room.command_revision ?? 0) + 1, events: [], rejected: false },
        () => settleGameRoom(db, roomId));
    } else if (room.source !== 'tournament') {
      // Protocol is set only after all stakes were charged; the room write makes this refund idempotent.
      for (const player of room.players) await db.collection('users').updateOne({ _id: player.playerId },
        { $inc: { balance: Number(room.bet_amount) } }, { session });
    }
    await db.collection('turn_deadlines').deleteMany({ room_id: roomId }, { session });
    const catalog = await db.collection('games').findOne({ _id: room.game_id }, { session });
    const code = gameCode(catalog?.socket_code);
    await db.collection('game_outbox').insertOne({ roomId, sequence: Number(room.command_revision ?? 0) + 1, index: 0,
      published: false, createdAt: now, event: { namespace: `/${code}`, rooms: room.players.map((p: any) => `player:${p.playerId}`),
        except: [], event: code, args: [{ success: true, data: { roomId, gameEnded: true,
          outcome: 'match_cancelled', reason: 'startup_unconfirmed', prize: 0 }, messages: [] }] } }, { session });
    return true;
  };
  const parent = commandContext.getStore();
  return parent ? work(parent.session) : db.transaction(work);
}
