import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { UnauthorizedException, ExecutionContext } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { AuthGuard } from './auth.guard';

const SECRET = 'unit-test-secret';
const ISSUER = 'play4cash-api';
const AUDIENCE = 'play4cash-clients';

interface FakeRedis {
  exists: jest.Mock<Promise<number>, [string]>;
}

function makeConfig(): ConfigService {
  const values: Record<string, unknown> = {
    'jwt.secret': SECRET,
    'jwt.issuer': ISSUER,
    'jwt.audience': AUDIENCE,
    'auth.accessCookieName': 'p4c_access',
  };
  return { get: <T>(k: string) => values[k] as T } as ConfigService;
}

function makeReflector(isPublic = false): Reflector {
  return { getAllAndOverride: jest.fn().mockReturnValue(isPublic) } as unknown as Reflector;
}

function makeRedis(exists = 1): FakeRedis {
  return { exists: jest.fn().mockResolvedValue(exists) };
}

function makeContext(headers: Record<string, string> & { cookie?: string } = {}): ExecutionContext {
  const request = { headers, user: undefined as unknown, token: undefined as unknown };
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function signAccess(payload: Record<string, unknown> = {}): string {
  return jwt.sign(
    { id: 'u1', email: 'u@x', typ: 'access', jti: 'j1', ...payload },
    SECRET,
    { issuer: ISSUER, audience: AUDIENCE, expiresIn: '5m' },
  );
}

describe('AuthGuard', () => {
  it('allows public routes without checking token', async () => {
    const guard = new AuthGuard(makeReflector(true), makeConfig(), makeRedis(0) as unknown as object);
    const ctx = makeContext({});
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('rejects when Authorization header is missing', async () => {
    const guard = new AuthGuard(makeReflector(false), makeConfig(), makeRedis() as unknown as object);
    await expect(guard.canActivate(makeContext({}))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('accepts a valid access token from the access cookie', async () => {
    const redis = makeRedis(1);
    const guard = new AuthGuard(makeReflector(false), makeConfig(), redis as unknown as object);
    const token = signAccess({ id: 'u-cookie' });
    const ctx = makeContext({ cookie: `p4c_access=${token}` });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('rejects when token is malformed (jwt.verify throws)', async () => {
    const guard = new AuthGuard(makeReflector(false), makeConfig(), makeRedis() as unknown as object);
    const ctx = makeContext({ authorization: 'Bearer not-a-jwt' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects refresh-typed tokens', async () => {
    const refresh = jwt.sign(
      { id: 'u1', email: 'u@x', typ: 'refresh', jti: 'j1' },
      SECRET,
      { issuer: ISSUER, audience: AUDIENCE, expiresIn: '5m' },
    );
    const guard = new AuthGuard(makeReflector(false), makeConfig(), makeRedis() as unknown as object);
    const ctx = makeContext({ authorization: `Bearer ${refresh}` });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when token is missing from Redis allowlist', async () => {
    const guard = new AuthGuard(
      makeReflector(false),
      makeConfig(),
      makeRedis(0) as unknown as object,
    );
    const ctx = makeContext({ authorization: `Bearer ${signAccess()}` });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when issuer does not match', async () => {
    const wrongIssuer = jwt.sign(
      { id: 'u1', email: 'u@x', typ: 'access', jti: 'j1' },
      SECRET,
      { issuer: 'someone-else', audience: AUDIENCE, expiresIn: '5m' },
    );
    const guard = new AuthGuard(makeReflector(false), makeConfig(), makeRedis() as unknown as object);
    const ctx = makeContext({ authorization: `Bearer ${wrongIssuer}` });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('passes for a valid access token in the allowlist and populates req.user', async () => {
    const redis = makeRedis(1);
    const guard = new AuthGuard(makeReflector(false), makeConfig(), redis as unknown as object);
    const token = signAccess({ id: 'u42' });
    const request: Record<string, unknown> = { headers: { authorization: `Bearer ${token}` } };
    const ctx = {
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(ctx)).resolves.toBe(true);

    expect(redis.exists).toHaveBeenCalledWith(expect.stringContaining(token));
    expect((request.user as { id: string }).id).toBe('u42');
    expect(request.token).toBe(token);
  });

  it('accepts the token without "Bearer " prefix', async () => {
    const guard = new AuthGuard(makeReflector(false), makeConfig(), makeRedis() as unknown as object);
    const token = signAccess();
    await expect(guard.canActivate(makeContext({ authorization: token }))).resolves.toBe(true);
  });
});
