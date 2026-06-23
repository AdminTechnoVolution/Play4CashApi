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
  const jwtSecret = config.get<string>('jwt.secret')!;
  const verifyOpts = jwtVerifyOptions(config);

  server.use(async (socket: Socket, next) => {
    const cookieToken = readCookieFromHeader(
      socket.handshake.headers?.cookie as string | undefined,
      accessCookieName(config),
    );
    let token: string =
      cookieToken ||
      (socket.handshake.auth?.token as string) ||
      (socket.handshake.query?.token as string) ||
      (socket.handshake.headers?.authorization as string) || '';

    if (token.startsWith('Bearer ')) token = token.slice(7);
    if (!token) return next(new Error('ERROR_AUTH'));

    let payload: jwt.JwtPayload & Record<string, unknown>;
    try {
      payload = jwt.verify(token, jwtSecret, verifyOpts) as jwt.JwtPayload & Record<string, unknown>;
    } catch {
      return next(new Error('ERROR_AUTH'));
    }

    if (!isAccessTokenPayload(payload)) {
      return next(new Error('ERROR_AUTH'));
    }

    try {
      const exists = await redis.exists(`${REDIS_KEY_ACCESS_TOKEN}${token}`);
      if (exists !== 1) return next(new Error('ERROR_AUTH'));
    } catch {
      return next(new Error('ERROR_AUTH'));
    }

    socket.data.player_id = payload.id;
    socket.data.token = token;
    next();
  });
}
