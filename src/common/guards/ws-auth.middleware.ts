import { acknowledgeInitialState } from '../ws/match-start';
import { redisSessionExists } from '../auth/redis-session';
import { registerReliableNamespace, reliableConnection, durableVersion } from '../reliable-commands/reliable-commands';
import { Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { Server, Socket } from 'socket.io';
import { REDIS_KEY_ACCESS_TOKEN } from '../constants/redis-keys.constants';
import { jwtVerifyOptions, isAccessTokenPayload } from '../auth/jwt-token.util';
import { accessCookieName, readCookieFromHeader } from '../../modules/auth/auth-cookie.util';

/**
 * Registers a socket.io USE middleware on the given server/namespace
 * that authenticates the connection on connect (not per-message).
 *
 * Usage in gateway afterInit(server: Server):
 *   applyWsAuth(server, this.config, this.redis);
 */
export function applyWsAuth(server: Server, config: ConfigService, redis: any): void {
  registerReliableNamespace(server);
  const jwtSecret = config.get<string>('jwt.secret')!;
  const verifyOpts = jwtVerifyOptions(config);

  server.use(async (socket: Socket, next) => {
    if (process.env.FINANCE_V2_ENABLED === 'true' && ['/chess', '/connect-four', '/halma', '/domino', '/uno', '/naval-battle'].includes((server as any).name)
      && socket.handshake.auth?.commandProtocol !== '1') return next(new Error('RELIABLE_COMMANDS_UPGRADE_REQUIRED'));
    const cookieToken = readCookieFromHeader(
      socket.handshake.headers?.cookie as string | undefined,
      accessCookieName(config),
    );
    let token: string =
      cookieToken ||
      (socket.handshake.auth?.token as string) ||
      (socket.handshake.headers?.authorization as string) || '';

    if (token.startsWith('Bearer ')) token = token.slice(7);
    if (!token) return next(new Error('ERROR_AUTH'));

    let payload: jwt.JwtPayload & Record<string, unknown>;
    try {
      payload = jwt.verify(token, jwtSecret, verifyOpts) as jwt.JwtPayload & Record<string, unknown>;
    } catch {
      return next(new Error('ERROR_AUTH'));
    }

    if (!isAccessTokenPayload(payload) || (payload.actor_type && payload.actor_type !== 'player')) {
      return next(new Error('ERROR_AUTH'));
    }

    try {
      const exists = await redisSessionExists(redis, `${REDIS_KEY_ACCESS_TOKEN}${token}`);
      if (!exists) return next(new Error('ERROR_AUTH'));
    } catch {
      return next(new Error('ERROR_AUTH'));
    }

    socket.data.player_id = payload.id;
    socket.data.token = token;
    await socket.join(`player:${payload.id}`);
    socket.use(async (_packet, accept) => {
      try {
        jwt.verify(token, jwtSecret, verifyOpts);
        if (!await redisSessionExists(redis, `${REDIS_KEY_ACCESS_TOKEN}${token}`)) return accept(new Error('ERROR_AUTH'));
        accept();
      } catch { accept(new Error('ERROR_AUTH')); }
    });
    socket.on('initial_state_ack', async (request: any) => {
      try {
        const state = await acknowledgeInitialState(reliableConnection(), (server as any).name, String(payload.id), request?.roomId ?? '');
        socket.emit('match_start_state', state);
      } catch { socket.emit('match_start_retry'); }
    });
    if (process.env.RELIABLE_COMMANDS_ENABLED === 'true') {
      socket.on('command_state', async (request: any) => {
        try {
          if (!await redisSessionExists(redis, `${REDIS_KEY_ACCESS_TOKEN}${token}`)) return;
          if (!Types.ObjectId.isValid(request?.roomId ?? '')) return;
          const room = await reliableConnection().collection('rooms').findOne({ _id: new Types.ObjectId(request.roomId),
            'players.playerId': new Types.ObjectId(String(payload.id)) });
          if (room) socket.emit('command_state', { roomId: request.roomId, version: Number(room.command_revision ?? 0) });
        } catch { socket.emit('command_recovery_unavailable'); }
      });
      socket.on('command_status', async (request: any) => {
        try {
          if (!await redisSessionExists(redis, `${REDIS_KEY_ACCESS_TOKEN}${token}`)) return;
          if (!request || !Types.ObjectId.isValid(request.roomId) || typeof request.commandId !== 'string' || !/^[a-zA-Z0-9:_-]{16,200}$/.test(request.commandId)) return;
          const db = reliableConnection();
          const stored = await db.collection('game_commands').findOne({ _id: `${request.roomId}:${payload.id}:${request.commandId}` as any });
          if (stored) { socket.emit('command_ack', stored.result); return; }
          const room = await db.collection('rooms').findOne({ _id: new Types.ObjectId(request.roomId), 'players.playerId': new Types.ObjectId(String(payload.id)) });
          if (!room) return;
          socket.emit('command_ack', { commandId: request.commandId, roomId: request.roomId,
            status: 'unknown', version: await durableVersion(request.roomId) });
        } catch { socket.emit('command_recovery_unavailable'); }
      });
    }
    next();
  });
}
