import { canPlay, isPreparing, cancelPreparedMatch } from '../ws/match-start';
import { settleGameRoom } from '../../modules/payments/game-finance';
import { randomUUID } from 'crypto';
import { ConflictException, Logger } from '@nestjs/common';
import mongoose, { Connection, Types } from 'mongoose';
import type { Server, Socket } from 'socket.io';
import { fingerprint, canonical } from '../../modules/payments/canonical';
import { commandContext, DurableEvent, flushTransactionWrites } from './context';
import { recordCommand } from './metrics';

let connection: Connection | undefined;
const namespaces = new Map<string, any>();
const disconnectHandlers = new Map<string, (data: any) => Promise<void>>();
export function registerReliableDisconnectHandler(namespace: string, handler: (data: any) => Promise<void>) {
  disconnectHandlers.set(namespace, handler);
}
export async function recoverDisconnects() {
  const rows = await reliableConnection().collection('game_disconnects').find({ completed: false }).sort({ checkedAt: 1, createdAt: 1 }).limit(25).toArray();
  for (const row of rows) {
    const handler = disconnectHandlers.get(row.namespace);
    if (handler) await handler(row.client);
  }
}
export function configureReliableCommands(db: Connection) {
  connection = db;
  mongoose.set('transactionAsyncLocalStorage', true);
}
export function reliableConnection() {
  if (!connection) throw new Error('RELIABLE_COMMANDS_NOT_INITIALIZED');
  return connection;
}
export function registerReliableNamespace(namespace: any) {
  namespaces.set(namespace.name ?? '/', namespace);
}
export function deliverDurableEvent(event: DurableEvent): boolean {
  const namespace = namespaces.get(event.namespace);
  if (!namespace) return false;
  let target = event.rooms.length ? namespace.to(event.rooms) : namespace;
  if (event.except.length) target = target.except(event.except);
  target.emit(event.event, ...event.args);
  return true;
}
/** Store emissions inside the command transaction; deliver only after commit. */
export function durableEmit(target: any, event: string, ...args: any[]): any {
  const context = commandContext.getStore();
  if (!context) return target.emit(event, ...args);
  let namespace: string;
  let rooms: string[];
  let except: string[];
  if (target.data) {
    namespace = target.nsp?.name ?? target.operator?.adapter?.nsp?.name;
    rooms = [`player:${target.data.player_id}`];
    except = [];
    if (!target.data.player_id) throw new Error('PRIVATE_EVENT_REQUIRES_PLAYER');
  } else {
    namespace = target.adapter?.nsp?.name ?? target.name;
    rooms = target.rooms ? Array.from(target.rooms) : [];
    except = target.exceptRooms ? Array.from(target.exceptRooms) : [];
  }
  if (!namespace) throw new Error('UNKNOWN_EVENT_NAMESPACE');
  // A direct error response rejects the mutation; error messages remain recoverable.
  if (args.some(arg => arg && typeof arg === 'object' && arg.success === false)) context.rejected = true;
  const versioned = args.map(arg => context.roomId && arg && typeof arg === 'object' && arg.data
    ? { ...arg, data: { ...arg.data, stateVersion: context.version, roomId: context.roomId } } : arg);
  context.events.push({ namespace, rooms, except, event, args: versioned });
  return true;
}

export async function durableVersion(roomId: string): Promise<number> {
  const context = commandContext.getStore();
  if (context?.roomId === roomId) return context.version;
  const room = await reliableConnection().collection('rooms').findOne({ _id: new Types.ObjectId(roomId) });
  return Number(room?.command_revision ?? 0);
}
class RejectedMutation extends Error {
  constructor(public readonly events: DurableEvent[]) { super('COMMAND_REJECTED'); }
}
const inFlightByActor = new Map<string, number>();
let inFlight = 0;
export function commandQueueDepth() { return inFlight; }
export async function executeReliableAction(...args: Parameters<typeof executeReliableActionImpl>) {
  const key = `${args[0]}:${args[1]}`;
  const preceding = inFlightByActor.get(key) ?? 0;
  if (inFlight >= 512 || preceding >= 8) throw new ConflictException('COMMAND_QUEUE_FULL');
  inFlight++; inFlightByActor.set(key, preceding + 1);
  try { return await executeReliableActionImpl(...args); }
  finally {
    inFlight--;
    const remaining = (inFlightByActor.get(key) ?? 1) - 1;
    if (remaining) inFlightByActor.set(key, remaining); else inFlightByActor.delete(key);
  }
}
async function executeReliableActionImpl(
  roomId: string, actorId: string, commandId: string, expectedVersion: number,
  name: string, payload: unknown, namespace: string, work: () => Promise<any>, internal = false,
) {
  const startedAt = performance.now();
  if (!Types.ObjectId.isValid(roomId) || !/^[a-zA-Z0-9:_-]{16,200}$/.test(commandId)
    || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0 || expectedVersion >= Number.MAX_SAFE_INTEGER) throw new ConflictException('INVALID_COMMAND_ENVELOPE');
  if (Buffer.byteLength(canonical(payload)) > 8192) throw new ConflictException('COMMAND_PAYLOAD_TOO_LARGE');
  const db = reliableConnection();
  const id = `${roomId}:${actorId}:${commandId}`;
  const hash = fingerprint({ name, payload });
  const ackTarget = { namespace, rooms: [`player:${actorId}`], except: [], event: 'command_ack' };
  let outcome: any;
  try {
    outcome = await db.transaction(async session => {
      const existing = await db.collection('game_commands').findOne({ _id: id as any }, { session });
      if (existing) {
        if (existing.hash !== hash) throw new ConflictException('COMMAND_ID_CONFLICT');
        return existing.result;
      }
      const room = await db.collection('rooms').findOne({ _id: new Types.ObjectId(roomId) }, { session });
      if (!room || (!internal && !room.players?.some((p: any) => String(p.playerId) === actorId))) {
        throw new ConflictException('COMMAND_PLAYER_NOT_IN_ROOM');
      }
      if (!internal) {
        const catalogue = await db.collection('games').findOne({ _id: room.game_id }, { session });
        const socketCode = catalogue?.socket_code === 'battleship' ? 'naval-battle' : catalogue?.socket_code === 'connect4' ? 'connect-four' : catalogue?.socket_code;
        if (!socketCode || namespace !== `/${socketCode}`) throw new ConflictException('COMMAND_WRONG_GAME_NAMESPACE');
      }
      if (Number(room.command_revision ?? 0) !== expectedVersion) throw new ConflictException('COMMAND_VERSION_CONFLICT');
      const claimed = await db.collection('rooms').updateOne({ _id: room._id,
        ...(expectedVersion === 0 ? { $or: [{ command_revision: 0 }, { command_revision: { $exists: false } }] }
          : { command_revision: expectedVersion }) },
        { $set: { command_revision: expectedVersion + 1 } }, { session });
      if (!claimed.modifiedCount) throw new ConflictException('COMMAND_VERSION_CONFLICT');
      const context = { session, roomId, version: expectedVersion + 1, events: [] as DurableEvent[], rejected: false };
      const isStartAction = name.startsWith('tryStart') || name === 'saveBattleshipPlacement' || name === 'handlePlaceShips' || name === 'setReady';
      if (!internal && !isStartAction && name !== 'leaveRoom' && !canPlay(room)) throw new ConflictException('MATCH_NOT_ACTIVE');
      await commandContext.run(context, async () => {
        await work();
        if (!context.rejected) await flushTransactionWrites(context);
        if (process.env.FINANCE_V2_ENABLED === 'true' && !context.rejected) await settleGameRoom(db, roomId);
      });
      if (context.rejected || (internal && name.startsWith('tryStart') && context.events.length === 0)) throw new RejectedMutation(context.events);
      const result = { commandId, roomId, status: 'accepted', version: context.version };
      await db.collection('game_commands').insertOne({ _id: id as any, roomId, actorId, commandId, hash, result,
        createdAt: new Date() }, { session });
      const events = [...context.events, ...(!internal ? [{ ...ackTarget, args: [result] }] : [])];
      if (events.length) await db.collection('game_outbox').insertMany(events.map((event, index) => ({
        commandId: id, roomId, sequence: context.version, index, event, published: false, createdAt: new Date(),
      })), { session });
      return result;
    }, { writeConcern: { w: 'majority' }, readConcern: { level: 'snapshot' } });
  } catch (error) {
    if (error instanceof RejectedMutation) {
      outcome = { commandId, roomId, status: 'rejected', version: expectedVersion };
      for (const event of error.events) deliverDurableEvent(event);
    } else if (error instanceof ConflictException) {
      outcome = { commandId, roomId, status: 'rejected', reason: error.message, version: await durableVersion(roomId) };
    } else {
      // Do not acknowledge success/terminal rejection for an unresolved database failure.
      throw error;
    }
  }
  if (outcome?.status === 'rejected') {
    await db.collection('game_commands').updateOne({ _id: id as any }, { $setOnInsert: {
      roomId, actorId, commandId, hash, result: outcome, createdAt: new Date(),
    } }, { upsert: true });
    const stored = await db.collection('game_commands').findOne({ _id: id as any });
    if (stored?.hash === hash) outcome = stored.result;
  }
  if (!internal) deliverDurableEvent({ ...ackTarget, args: [outcome] });
  recordCommand(performance.now() - startedAt, outcome);
  return outcome;
}

export function ReliableAction(): MethodDecorator {
  return (_target, property, descriptor: PropertyDescriptor) => {
    const original = descriptor.value;
    descriptor.value = async function (client: Socket, payload: any, ...args: any[]) {
      if (connection && String(property) !== 'handlePlaceShips') {
        const id = payload?.room_id ?? payload?.roomId ?? client.data.room_id;
        if (Types.ObjectId.isValid(id ?? '')) {
          const room = await connection.collection('rooms').findOne({ _id: new Types.ObjectId(id) });
          if (!canPlay(room)) {
            if (String(property).toLowerCase().includes('forfeit') && isPreparing(room)) {
              await cancelPreparedMatch(connection, id); return;
            }
            client.emit('match_start_retry'); return;
          }
        }
      }
      if (process.env.RELIABLE_COMMANDS_ENABLED !== 'true' || commandContext.getStore()) return original.call(this, client, payload, ...args);
      const roomId = payload?.room_id ?? payload?.roomId ?? client.data.room_id;
      return executeReliableAction(roomId, client.data.player_id, payload?.commandId, payload?.expectedVersion,
        String(property), payload, client.nsp.name, () => original.call(this, client, payload, ...args));
    };
  };
}

/** Lifecycle callbacks are not caught by Nest's packet exception filter. Persist before processing. */
export function ReliableDisconnectAction(): MethodDecorator {
  return (_target, property, descriptor: PropertyDescriptor) => {
    const original = descriptor.value;
    descriptor.value = async function (client: Socket) {
      if (connection && Types.ObjectId.isValid(client.data?.room_id ?? '')) {
        const room = await connection.collection('rooms').findOne({ _id: new Types.ObjectId(client.data.room_id) });
        if (isPreparing(room) || (room?.status === 'started' && !room.game_ready_at)) return; // Preparation deadline cancels/refunds; a socket loss never awards a win.
      }
      if (process.env.RELIABLE_COMMANDS_ENABLED !== 'true') return original.call(this, client);
      const roomId = client.data?.room_id;
      const actorId = client.data?.player_id;
      if (!Types.ObjectId.isValid(roomId ?? '') || !Types.ObjectId.isValid(actorId ?? '')) return;
      const namespace = (this as any).server.name;
      const id = `${namespace}:${client.id}`;
      const db = reliableConnection();
      try {
        await db.collection('game_disconnects').updateOne({ _id: id as any }, { $setOnInsert: {
          namespace, roomId, completed: false, createdAt: new Date(),
          client: { id: client.id, data: { room_id: roomId, player_id: actorId, lang: client.data.lang, isSpectator: client.data.isSpectator } },
        } }, { upsert: true });
        const currentRoom = await db.collection('rooms').findOne({ _id: new Types.ObjectId(roomId) });
        if (!currentRoom || currentRoom.status === 'finished') {
          await db.collection('game_disconnects').updateOne({ _id: id as any }, { $set: { completed: true, checkedAt: new Date(), reason: 'room_terminal_or_missing' } });
          return;
        }
        const version = await durableVersion(roomId);
        const result = await executeReliableAction(roomId, 'server', `disconnect:${client.id}:${version}`, version,
          String(property), { roomId, actorId, socketId: client.id }, namespace, async () => {
            const processDisconnect = async () => {
            const room = await db.collection('rooms').findOne({ _id: new Types.ObjectId(roomId) }, { session: commandContext.getStore()!.session });
            if (!room || room.status === 'finished') return;
            const connected = await (this as any).server.in(roomId).fetchSockets();
            if (connected.some((s: any) => s.id !== client.id && s.data?.player_id === actorId)) return;
            // Empty active rooms collide on null in the unique multikey index. Finish before removing the last player.
            if ((room.status === 'waiting' || !room.game_ready_at) && room.players?.length === 1
              && String(room.players[0].playerId) === actorId) {
              await db.collection('rooms').updateOne({ _id: room._id }, { $set: { status: 'finished', finished_at: new Date(), winner_reason: 'empty_waiting_room' } }, { session: commandContext.getStore()!.session });
              durableEmit((this as any).server.to(roomId), namespace.slice(1), { success: true, data: { gameEnded: true, opponentLeft: true } });
              return;
            }
            await original.call(this, client);
            };
            await processDisconnect();
            await db.collection('game_disconnects').updateOne({ _id: id as any }, { $set: { completed: true, checkedAt: new Date() } }, { session: commandContext.getStore()!.session });
          }, true);
        await db.collection('game_disconnects').updateOne({ _id: id as any, completed: false }, {
          $set: { ...(result.status === 'accepted' ? { completed: true } : {}), checkedAt: new Date() },
        });
      } catch {
        // MongoDB retains the pending lifecycle action; recovery retries without crashing the API.
        new Logger('ReliableDisconnect').warn('event=disconnect_recovery_pending');
      }
    };
  };
}
export function ReliableInternalAction(): MethodDecorator {
  return (_target, property, descriptor: PropertyDescriptor) => {
    const original = descriptor.value;
    descriptor.value = async function (roomId: string, ...args: any[]) {
      const guarded = async () => {
        if (connection && !String(property).startsWith('tryStart')) {
          const room = await connection.collection('rooms').findOne({ _id: new Types.ObjectId(roomId) },
            { session: commandContext.getStore()?.session });
          if (!canPlay(room)) {
            if (isPreparing(room) && (String(property).toLowerCase().includes('forfeit') || (property === 'eliminatePlayer' && args[1] !== 'timeout'))) await cancelPreparedMatch(connection, roomId);
            return;
          }
          // A local timer armed during preparation must not expire the fresh first turn.
          if (room?.start_protocol === 1 && (String(property).toLowerCase().includes('timeout') || (property === 'eliminatePlayer' && args[1] === 'timeout'))) {
            const deadline = await connection.collection('turn_deadlines').findOne({ room_id: roomId }, { session: commandContext.getStore()?.session });
            if (!deadline || new Date(deadline.expires_at).getTime() > Date.now()) return;
          }
        }
        return original.call(this, roomId, ...args);
      };
      if (process.env.RELIABLE_COMMANDS_ENABLED !== 'true') return guarded();
      const parent = commandContext.getStore();
      if (parent) {
        if (parent.mode === 'read') {
          const db = reliableConnection();
          const room = await db.collection('rooms').findOne({ _id: new Types.ObjectId(roomId) }, { session: parent.session });
          if (String(property).startsWith('tryStart') && (room?.game_ready_at || !room?.players?.every((p: any) => p.ready) || room.players.length < 2)) return guarded();
          await db.collection('rooms').updateOne({ _id: new Types.ObjectId(roomId) }, { $inc: { command_revision: 1 } }, { session: parent.session });
          parent.version++; parent.mode = 'command';
        }
        return guarded();
      }
      if (String(property).toLowerCase().includes('timeout') || (property === 'eliminatePlayer' && args[1] === 'timeout')) {
        const db = reliableConnection();
        const room = await db.collection('rooms').findOne({ _id: new Types.ObjectId(roomId) });
        if (!room || room.status !== 'started') return;
        const catalogue = await db.collection('games').findOne({ _id: room.game_id });
        const collections: Record<string, string> = { '/chess': 'chessgames', '/halma': 'halmagames', '/connect-four': 'connectfourgames', '/domino': 'dominogames', '/uno': 'unogames' };
        const collection = collections[(this as any).server.name];
        const game = collection ? await db.collection(collection).findOne({ room_id: room._id }) : null;
        const started = game?.turn_start_time ?? room.turn_start_time;
        if (started && Date.now() < new Date(started).getTime() + Number(catalogue?.turn_timer_seconds ?? 30) * 1000) return;
      }
      const version = await durableVersion(roomId);
      return executeReliableAction(roomId, 'server', `server:${property.toString()}:${version}`, version,
        String(property), { roomId, args }, (this as any).server.name ?? '/', guarded, true);
    };
  };
}

/** REST room mutations share the same room lock and transaction as socket actions. */
export function ReliableRoomServiceAction(): MethodDecorator {
  return (_target, property, descriptor: PropertyDescriptor) => {
    const original = descriptor.value;
    descriptor.value = async function (userId: string, roomId: string, ...args: any[]) {
      if (process.env.RELIABLE_COMMANDS_ENABLED !== 'true' || commandContext.getStore()) return original.call(this, userId, roomId, ...args);
      const db = reliableConnection();
      const room = await db.collection('rooms').findOne({ _id: new Types.ObjectId(roomId) });
      const catalogue = room ? await db.collection('games').findOne({ _id: room.game_id }) : null;
      const namespace = catalogue?.socket_code === 'battleship' ? '/naval-battle' : `/${catalogue?.socket_code ?? 'rooms'}`;
      const version = await durableVersion(roomId);
      const id = randomUUID();
      let value: any;
      const result = await executeReliableAction(roomId, userId, id, version, String(property), { userId, roomId, args }, namespace,
        async () => { value = await original.call(this, userId, roomId, ...args); });
      if (result.status !== 'accepted') throw new ConflictException(result.reason ?? 'ROOM_ACTION_REJECTED');
      return value ?? { ...result, success: true };
    };
  };
}

/** Read snapshots use one MongoDB snapshot and keep its version through delayed delivery. */
export function ReliableReadAction(): MethodDecorator {
  return (_target, _property, descriptor: PropertyDescriptor) => {
    const original = descriptor.value;
    descriptor.value = async function (client: Socket, payload: any, ...args: any[]) {
      if (process.env.RELIABLE_COMMANDS_ENABLED !== 'true' || commandContext.getStore()) return original.call(this, client, payload, ...args);
      const roomId = payload?.room_id ?? payload?.roomId ?? client.data.room_id;
      if (!Types.ObjectId.isValid(roomId ?? '')) throw new ConflictException('INVALID_ROOM');
      const db = reliableConnection();
      try {
        return await db.transaction(async session => {
          const room = await db.collection('rooms').findOne({ _id: new Types.ObjectId(roomId) }, { session });
          if (!room || ![...(room.players ?? []).map((p: any) => String(p.playerId)), ...(room.spectators ?? []).map(String)].includes(client.data.player_id)) {
            throw new ConflictException('ROOM_VIEWER_NOT_AUTHORIZED');
          }
          const catalogue = await db.collection('games').findOne({ _id: room.game_id }, { session });
          const code = catalogue?.socket_code === 'battleship' ? 'naval-battle' : catalogue?.socket_code === 'connect4' ? 'connect-four' : catalogue?.socket_code;
          if (client.nsp.name !== `/${code}`) throw new ConflictException('COMMAND_WRONG_GAME_NAMESPACE');
          const context = { session, roomId, version: Number(room.command_revision ?? 0), events: [] as DurableEvent[], rejected: false, mode: 'read' as const };
          const result = await commandContext.run(context, async () => {
            const value = await original.call(this, client, payload, ...args);
            if (!context.rejected) await flushTransactionWrites(context);
            return value;
          });
          if (context.rejected) throw new RejectedMutation(context.events);
          if (context.events.length) await db.collection('game_outbox').insertMany(context.events.map((event, index) => ({
            commandId: `snapshot:${randomUUID()}`, roomId, sequence: context.version, index, event,
            published: false, createdAt: new Date(),
          })), { session });
          return result;
        }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
      } catch (error) {
        if (error instanceof RejectedMutation) { for (const event of error.events) deliverDurableEvent(event); return; }
        throw error;
      }
    };
  };
}
