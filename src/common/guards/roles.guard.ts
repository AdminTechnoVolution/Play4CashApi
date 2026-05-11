import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import type { JwtPayload } from '../decorators/current-user.decorator';

/**
 * Authorizes by `payload.role` (which is signed at login/refresh from DB + ADMIN_EMAILS fallback).
 * Assumes `AuthGuard` already populated `req.user`.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Array<'admin' | 'user'>>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayload | undefined;
    if (!user) throw new ForbiddenException('ERROR_AUTH');

    if (required.includes(user.role || 'user')) return true;

    // Legacy fallback for users predating the DB `role` field.
    if (required.includes('admin')) {
      const adminEmails = (this.config.get<string[]>('admin.emails') || []).map((e) => e.toLowerCase());
      const email = (user.email || '').toLowerCase();
      if (email && adminEmails.includes(email)) return true;
    }

    throw new ForbiddenException('ERROR_AUTH');
  }
}
