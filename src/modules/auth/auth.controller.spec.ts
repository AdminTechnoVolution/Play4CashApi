import { NotFoundException, ValidationPipe } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { FakeLoginDto } from './dto/fake-login.dto';

/**
 * The fake-login route (POST /login/fake) must be a hard no-op — not just
 * unauthorized, genuinely 404 — whenever `auth.fakeLoginEnabled` is off, so a
 * production probe can't tell the difference between "disabled" and "doesn't exist".
 */
function makeController(overrides: { fakeLoginEnabled?: boolean } = {}) {
  const authService = {
    fakeLogin: jest.fn().mockResolvedValue({
      success: true,
      messages: [],
      data: { token: 'access-tok', refreshToken: 'refresh-tok' },
    }),
  } as any;
  const i18n = { translate: jest.fn((key: string) => key) } as any;
  const cfg: Record<string, unknown> = {
    'auth.fakeLoginEnabled': overrides.fakeLoginEnabled ?? true,
    'auth.refreshCookieName': 'p4c_refresh',
    'auth.accessCookieName': 'p4c_access',
    'auth.refreshCookieSameSite': 'lax',
    'auth.refreshCookieSecure': false,
    'auth.cookieDomain': undefined,
    'jwt.refreshTtlSecs': 86400,
    'jwt.accessTtlSecs': 3600,
  };
  const config = { get: (k: string) => cfg[k] } as any;
  const controller = new AuthController(authService, i18n, config);
  const res = { cookie: jest.fn(), clearCookie: jest.fn() } as any;
  return { controller, authService, res };
}

describe('AuthController.fakeLogin', () => {
  it('returns 404 when auth.fakeLoginEnabled is off', async () => {
    const { controller, authService, res } = makeController({ fakeLoginEnabled: false });

    await expect(
      controller.fakeLogin({ email: 'e2e-alice@play4cash.test' }, res),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(authService.fakeLogin).not.toHaveBeenCalled();
  });

  it('issues tokens and sets both cookies when enabled', async () => {
    const { controller, authService, res } = makeController({ fakeLoginEnabled: true });

    const out = await controller.fakeLogin(
      { email: 'e2e-alice@play4cash.test', name: 'Alice' },
      res,
    );

    expect(authService.fakeLogin).toHaveBeenCalledWith('e2e-alice@play4cash.test', 'Alice');
    expect(out.data.token).toBe('access-tok');
    expect(res.cookie).toHaveBeenCalledWith('p4c_access', 'access-tok', expect.any(Object));
    expect(res.cookie).toHaveBeenCalledWith('p4c_refresh', 'refresh-tok', expect.any(Object));
  });
});

describe('FakeLoginDto validation', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });

  it('rejects an email outside the reserved play4cash.test domain', async () => {
    // This is the whole point of the restriction: fake-login must never be able to
    // mint a session for a real, production email address.
    await expect(
      pipe.transform({ email: 'someone@gmail.com' }, { type: 'body', metatype: FakeLoginDto }),
    ).rejects.toThrow();
    await expect(
      pipe.transform({ email: 'e2e-alice@play4cash.com' }, { type: 'body', metatype: FakeLoginDto }),
    ).rejects.toThrow();
  });

  it('accepts a well-formed play4cash.test address', async () => {
    const result = await pipe.transform(
      { email: 'e2e-alice@play4cash.test', name: 'Alice' },
      { type: 'body', metatype: FakeLoginDto },
    );
    expect(result.email).toBe('e2e-alice@play4cash.test');
  });
});
