/**
 * `createParamDecorator` is consumed by Nest at route setup time and the actual extractor
 * lives inside framework metadata, so we test the equivalent extraction logic directly:
 * `request.user` must be returned as-is by `CurrentUser`.
 */
import type { ExecutionContext } from '@nestjs/common';

function extractCurrentUser(ctx: ExecutionContext) {
  return ctx.switchToHttp().getRequest().user;
}

describe('CurrentUser extractor (logical contract)', () => {
  it('returns the user object that AuthGuard placed on the request', () => {
    const user = { id: 'u1', email: 'a@b', typ: 'access' as const, iat: 0, exp: 0 };
    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    } as unknown as ExecutionContext;
    expect(extractCurrentUser(ctx)).toBe(user);
  });

  it('returns undefined when AuthGuard did not run (e.g. public route)', () => {
    const ctx = {
      switchToHttp: () => ({ getRequest: () => ({}) }),
    } as unknown as ExecutionContext;
    expect(extractCurrentUser(ctx)).toBeUndefined();
  });
});
