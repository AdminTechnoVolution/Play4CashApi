import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { AuthGuard } from './auth.guard';
const secret = 'fixture-player-secret';
const token = () => jwt.sign({ id: '507f1f77bcf86cd799439011', typ: 'access' }, secret, { issuer: 'play4cash-api', audience: 'play4cash-clients' });
function setup(headers: Record<string, string>) {
  const request: any = { headers };
  const redis = { isReady: true, exists: jest.fn(async () => 1) };
  const guard = new AuthGuard({ getAllAndOverride: () => false } as unknown as Reflector,
    new ConfigService({ jwt: { secret, issuer: 'play4cash-api', audience: 'play4cash-clients' }, auth: { accessCookieName: 'p4c_access' } }), redis);
  const context = { getHandler() {}, getClass() {}, switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
  return { guard, context, request, redis };
}
describe('player HTTP token selection', () => {
  it('accepts a fresh bearer even when a stale cookie is present', async () => {
    const fresh = token(); const state = setup({ authorization: `Bearer ${fresh}`, cookie: 'p4c_access=expired-cookie' });
    expect(await state.guard.canActivate(state.context)).toBe(true);
    expect(state.request.token).toBe(fresh);
    expect(state.redis.exists).toHaveBeenCalledWith(`accessTokens:${fresh}`);
  });
  it('accepts cookie-only browser sessions', async () => {
    const state = setup({ cookie: `p4c_access=${token()}` });
    expect(await state.guard.canActivate(state.context)).toBe(true);
  });
  it('does not label Redis unavailability as an expired session', async () => {
    const state = setup({ authorization: `Bearer ${token()}` });
    state.redis.isReady = false;
    await expect(state.guard.canActivate(state.context)).rejects.toMatchObject({ status: 503 });
    expect(state.redis.exists).not.toHaveBeenCalled();
  });
  it('never falls back to another identity after an invalid explicit bearer', async () => {
    const state = setup({ authorization: 'Bearer invalid', cookie: `p4c_access=${token()}` });
    await expect(state.guard.canActivate(state.context)).rejects.toThrow('ERROR_AUTH');
    expect(state.redis.exists).not.toHaveBeenCalled();
  });
});
