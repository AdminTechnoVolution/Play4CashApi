import configuration from './configuration';

describe('configuration throttle defaults', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.THROTTLE_LIMIT;
    delete process.env.THROTTLE_TTL_MS;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('falls back to 50 when THROTTLE_LIMIT is empty or invalid', () => {
    process.env.THROTTLE_LIMIT = '';
    expect(configuration().throttle.limit).toBe(50);

    process.env.THROTTLE_LIMIT = 'not-a-number';
    expect(configuration().throttle.limit).toBe(50);
  });

  it('falls back to 60000 when THROTTLE_TTL_MS is empty or invalid', () => {
    process.env.THROTTLE_TTL_MS = '';
    expect(configuration().throttle.ttlMs).toBe(60_000);

    process.env.THROTTLE_TTL_MS = 'oops';
    expect(configuration().throttle.ttlMs).toBe(60_000);
  });

  it('defaults auth cookies to SameSite=None in production', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.AUTH_REFRESH_COOKIE_SAMESITE;
    expect(configuration().auth.refreshCookieSameSite).toBe('none');
  });

  it('forces SameSite=None in production even when env is lax', () => {
    process.env.NODE_ENV = 'production';
    process.env.AUTH_REFRESH_COOKIE_SAMESITE = 'lax';
    expect(configuration().auth.refreshCookieSameSite).toBe('none');
  });

  it('defaults auth cookies to SameSite=Lax outside production', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.AUTH_REFRESH_COOKIE_SAMESITE;
    expect(configuration().auth.refreshCookieSameSite).toBe('lax');
  });
});
