import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { REDIS_CLIENT } from '../redis/redis.module';
import { REDIS_KEY_ACCESS_TOKEN } from '../constants/redis-keys.constants';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: any,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader: string = request.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : authHeader;

    if (!token) throw new ForbiddenException('ERROR_AUTH');

    // 1. Verify JWT and extract email
    let payload: any;
    try {
      payload = jwt.verify(token, this.config.get<string>('jwt.secret')!);
    } catch {
      throw new ForbiddenException('ERROR_AUTH');
    }

    // 2. Verify email is in admin list
    const adminEmails = this.config.get<string[]>('admin.emails') || [];
    if (!payload.email || !adminEmails.includes(payload.email.toLowerCase())) {
      throw new ForbiddenException('ERROR_AUTH');
    }

    // 3. Verify token is still active in Redis
    const exists = await this.redis.exists(`${REDIS_KEY_ACCESS_TOKEN}${token}`);
    if (exists !== 1) throw new ForbiddenException('ERROR_AUTH');

    return true;
  }
}
