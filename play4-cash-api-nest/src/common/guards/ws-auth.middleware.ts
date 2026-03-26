import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { Server, Socket } from 'socket.io';
import { REDIS_CLIENT } from '../redis/redis.module';
import { Inject } from '@nestjs/common';
import { REDIS_KEY_ACCESS_TOKEN } from '../constants/redis-keys.constants';

/**
 * Registers a socket.io USE middleware on the given server/namespace
 * that authenticates the connection on connect (not per-message).
 * This mirrors the original Express socket.io auth middleware behavior.
 *
 * Usage in gateway afterInit(server: Server):
 *   applyWsAuth(server, this.config, this.redis);
 */
export function applyWsAuth(
  server: Server,
  jwtSecret: string,
  redis: any,
): void {
  server.use(async (socket: Socket, next) => {
    let token: string =
      (socket.handshake.auth?.token as string) ||
      (socket.handshake.query?.token as string) ||
      (socket.handshake.headers?.authorization as string) || '';

    if (token.startsWith('Bearer ')) token = token.slice(7);
    if (!token) return next(new Error('ERROR_AUTH'));

    let payload: any;
    try {
      payload = jwt.verify(token, jwtSecret) as any;
    } catch {
      return next(new Error('ERROR_AUTH'));
    }

    try {
      const exists = await redis.exists(`${REDIS_KEY_ACCESS_TOKEN}${token}`);
      if (exists !== 1) return next(new Error('ERROR_AUTH'));
    } catch {
      return next(new Error('ERROR_AUTH'));
    }

    // Set player identity once on connection — available in ALL event handlers
    socket.data.player_id = payload.id;
    socket.data.token = token;
    next();
  });
}
