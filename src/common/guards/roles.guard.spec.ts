import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from '../decorators/roles.decorator';

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
    const guard = new RolesGuard(reflectorMock(undefined));
    expect(guard.canActivate(ctxWith({ role: 'user', email: 'a@b.com' }))).toBe(true);
  });

  it('allows admin role on @Roles("admin") routes', () => {
    const guard = new RolesGuard(reflectorMock(['admin']));
    expect(guard.canActivate(ctxWith({ role: 'admin', email: 'a@b.com' }))).toBe(true);
  });

  it('rejects user role on admin-only routes', () => {
    const guard = new RolesGuard(reflectorMock(['admin']));
    expect(() => guard.canActivate(ctxWith({ role: 'user', email: 'a@b.com' }))).toThrow(ForbiddenException);
  });

  it('does not elevate a player based on email', () => {
    const guard = new RolesGuard(reflectorMock(['admin']));
    expect(() => guard.canActivate(ctxWith({
      role: 'user',
      email: 'admin@p4c.com',
    }))).toThrow(ForbiddenException);
  });

  it('rejects when user payload is missing', () => {
    const guard = new RolesGuard(reflectorMock(['admin']));
    expect(() => guard.canActivate(ctxWith(undefined))).toThrow(ForbiddenException);
  });

  it('ROLES_KEY constant is stable for decorator interop', () => {
    expect(ROLES_KEY).toBe('roles');
  });
});
