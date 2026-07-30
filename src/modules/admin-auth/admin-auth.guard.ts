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
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { REDIS_CLIENT } from '../../common/redis/redis.module';
import { ADMIN_REDIS_ACCESS } from './admin-auth.constants';
import { ADMIN_ACCESS_COOKIE, readNamedCookie } from './admin-auth-cookie.util';
import { AdminRepository } from './admin.repository';
import { AdminStatus } from './schemas/admin.schema';

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
    private readonly admins: AdminRepository,
    @Inject(REDIS_CLIENT) private readonly redis: any,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const header = String(request.headers.authorization || '');
    const cookie = readNamedCookie(request.headers.cookie, ADMIN_ACCESS_COOKIE);
    const token = (header.startsWith('Bearer ') ? header.slice(7) : '') || cookie;
    if (!token) throw new UnauthorizedException('ERROR_AUTH');

    let payload: jwt.JwtPayload & Record<string, unknown>;
    try {
      payload = jwt.verify(
        token,
        this.config.get<string>('adminAuth.jwtSecret')!,
        {
          issuer: this.config.get<string>('adminAuth.issuer'),
          audience: this.config.get<string>('adminAuth.audience'),
        },
      ) as jwt.JwtPayload & Record<string, unknown>;
    } catch {
      throw new UnauthorizedException('ERROR_AUTH');
    }
    if (
      payload.typ !== 'access'
      || payload.actor_type !== 'admin'
      || payload.role !== 'admin'
      || await this.redis.exists(`${ADMIN_REDIS_ACCESS}${token}`) !== 1
    ) {
      throw new UnauthorizedException('ERROR_AUTH');
    }

    const admin = await this.admins.findById(String(payload.id || payload.sub || ''));
    if (!admin || admin.status !== AdminStatus.ACTIVE) {
      throw new UnauthorizedException('ERROR_AUTH');
    }
    request.user = payload;
    request.token = token;
    return true;
  }
}
