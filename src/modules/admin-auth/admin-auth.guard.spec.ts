import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminStatus } from './schemas/admin.schema';
import { ADMIN_REDIS_ACCESS } from './admin-auth.constants';

const config = {
  get: (key: string) => ({
    'adminAuth.jwtSecret': 'admin-secret',
    'adminAuth.issuer': 'p4c',
    'adminAuth.audience': 'play4cash-admin',
  })[key],
} as any;

function context(token: string, cookieToken?: string): ExecutionContext {
  const request = {
    headers: {
      authorization: `Bearer ${token}`,
      ...(cookieToken ? { cookie: `p4c_admin_access=${cookieToken}` } : {}),
    },
  };
  return {
    getHandler: () => null,
    getClass: () => null,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function sign(secret: string, audience: string, actorType: 'admin' | 'player') {
  return jwt.sign(
    {
      id: '507f1f77bcf86cd799439011',
      typ: 'access',
      actor_type: actorType,
      role: actorType === 'admin' ? 'admin' : 'user',
    },
    secret,
    { issuer: 'p4c', audience, expiresIn: 60 },
  );
}

describe('AdminAuthGuard', () => {
  const reflector = { getAllAndOverride: jest.fn(() => false) } as any;
  const admins = {
    findById: jest.fn(async () => ({ status: AdminStatus.ACTIVE })),
  } as any;

  it('accepts an allowlisted active administrative token', async () => {
    const token = sign('admin-secret', 'play4cash-admin', 'admin');
    const redis = {
      exists: jest.fn(async (key: string) => key === `${ADMIN_REDIS_ACCESS}${token}` ? 1 : 0),
    } as any;
    const guard = new AdminAuthGuard(reflector, config, admins, redis);
    await expect(guard.canActivate(context(token))).resolves.toBe(true);
  });

  it('prefers the current bearer token over a stale admin cookie', async () => {
    const token = sign('admin-secret', 'play4cash-admin', 'admin');
    const redis = {
      exists: jest.fn(async (key: string) => key === `${ADMIN_REDIS_ACCESS}${token}` ? 1 : 0),
    } as any;
    const guard = new AdminAuthGuard(reflector, config, admins, redis);

    await expect(guard.canActivate(context(token, 'stale-cookie-token'))).resolves.toBe(true);
    expect(redis.exists).toHaveBeenCalledWith(`${ADMIN_REDIS_ACCESS}${token}`);
  });

  it('rejects a player token even when presented to an admin route', async () => {
    const playerToken = sign('player-secret', 'play4cash-clients', 'player');
    const guard = new AdminAuthGuard(
      reflector,
      config,
      admins,
      { exists: jest.fn(async () => 1) } as any,
    );
    await expect(guard.canActivate(context(playerToken))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects disabled admins immediately', async () => {
    const token = sign('admin-secret', 'play4cash-admin', 'admin');
    const guard = new AdminAuthGuard(
      reflector,
      config,
      { findById: jest.fn(async () => ({ status: AdminStatus.DISABLED })) } as any,
      { exists: jest.fn(async () => 1) } as any,
    );
    await expect(guard.canActivate(context(token))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
