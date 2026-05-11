import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { JwtPayload } from '../decorators/current-user.decorator';

/**
 * Authorizes admin-only endpoints. Relies on `AuthGuard` having already verified the JWT and
 * populated `req.user`. Considers `role==='admin'` from the signed payload OR `ADMIN_EMAILS`
 * legacy allowlist (for users predating the DB `role` field).
 *
 * Prefer `@Roles('admin')` + `RolesGuard` for new code.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayload | undefined;
    if (!user) throw new ForbiddenException('ERROR_AUTH');

    if (user.role === 'admin') return true;

    const adminEmails = (this.config.get<string[]>('admin.emails') || []).map((e) => e.toLowerCase());
    const email = (user.email || '').toLowerCase();
    if (email && adminEmails.includes(email)) return true;

    throw new ForbiddenException('ERROR_AUTH');
  }
}
