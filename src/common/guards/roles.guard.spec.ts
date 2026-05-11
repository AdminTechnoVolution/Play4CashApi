import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from '../decorators/roles.decorator';

function configMock(values: Record<string, unknown>): ConfigService {
  return { get: <T>(key: string) => values[key] as T } as unknown as ConfigService;
}

function reflectorMock(roles: Array<'admin' | 'user'> | undefined): Reflector {
  return { getAllAndOverride: () => roles } as unknown as Reflector;
}

function ctxWith(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => null,
    getClass: () => null,
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  it('allows when no role metadata is set', () => {
    const guard = new RolesGuard(reflectorMock(undefined), configMock({}));
    expect(guard.canActivate(ctxWith({ role: 'user', email: 'a@b.com' }))).toBe(true);
  });

  it('allows admin role on @Roles("admin") routes', () => {
    const guard = new RolesGuard(reflectorMock(['admin']), configMock({}));
    expect(guard.canActivate(ctxWith({ role: 'admin', email: 'a@b.com' }))).toBe(true);
  });

  it('rejects user role on admin-only routes', () => {
    const guard = new RolesGuard(reflectorMock(['admin']), configMock({}));
    expect(() => guard.canActivate(ctxWith({ role: 'user', email: 'a@b.com' }))).toThrow(ForbiddenException);
  });

  it('falls back to ADMIN_EMAILS legacy allowlist', () => {
    const guard = new RolesGuard(
      reflectorMock(['admin']),
      configMock({ 'admin.emails': ['admin@p4c.com'] }),
    );
    expect(guard.canActivate(ctxWith({ role: 'user', email: 'Admin@P4C.com' }))).toBe(true);
  });

  it('rejects when user payload is missing', () => {
    const guard = new RolesGuard(reflectorMock(['admin']), configMock({}));
    expect(() => guard.canActivate(ctxWith(undefined))).toThrow(ForbiddenException);
  });

  it('ROLES_KEY constant is stable for decorator interop', () => {
    expect(ROLES_KEY).toBe('roles');
  });
});
