import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { REDIS_CLIENT } from '../redis/redis.module';
import { REDIS_KEY_ACCESS_TOKEN } from '../constants/redis-keys.constants';
import { jwtVerifyOptions, isAccessTokenPayload } from '../auth/jwt-token.util';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: any,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const authHeader: string = request.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader;

    if (!token) throw new UnauthorizedException('ERROR_AUTH');

    let payload: jwt.JwtPayload & Record<string, unknown>;
    try {
      payload = jwt.verify(token, this.config.get<string>('jwt.secret')!, jwtVerifyOptions(this.config)) as jwt.JwtPayload &
        Record<string, unknown>;
    } catch {
      throw new UnauthorizedException('ERROR_AUTH');
    }

    if (!isAccessTokenPayload(payload)) {
      throw new UnauthorizedException('ERROR_AUTH');
    }

    const exists = await this.redis.exists(`${REDIS_KEY_ACCESS_TOKEN}${token}`);
    if (exists !== 1) throw new UnauthorizedException('ERROR_AUTH');

    request.user = payload;
    request.token = token;
    return true;
  }
}
