import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WsException } from '@nestjs/websockets';
import * as jwt from 'jsonwebtoken';
import { Socket } from 'socket.io';
import { REDIS_CLIENT } from '../redis/redis.module';
import { Inject } from '@nestjs/common';
import { REDIS_KEY_ACCESS_TOKEN } from '../constants/redis-keys.constants';
import { accessCookieName, readCookieFromHeader } from '../../modules/auth/auth-cookie.util';

@Injectable()
export class WsAuthGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: any,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client: Socket = context.switchToWs().getClient();
    const cookieToken = readCookieFromHeader(
      client.handshake.headers?.cookie as string | undefined,
      accessCookieName(this.config),
    );
    let token: string =
      cookieToken ||
      client.handshake.auth?.token ||
      client.handshake.query?.token as string ||
      client.handshake.headers?.authorization || '';

    if (token.startsWith('Bearer ')) token = token.slice(7);
    if (!token) throw new WsException('ERROR_AUTH');

    let payload: any;
    try {
      payload = jwt.verify(token, this.config.get<string>('jwt.secret')!);
    } catch {
      throw new WsException('ERROR_AUTH');
    }

    const exists = await this.redis.exists(`${REDIS_KEY_ACCESS_TOKEN}${token}`);
    if (exists !== 1) throw new WsException('ERROR_AUTH');

    client.data.player_id = payload.id;
    client.data.token = token;
    return true;
  }
}
