import type { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import {
  readCookieFromHeader,
  refreshCookieName,
  accessCookieName,
  buildRefreshCookieOptions,
  buildAccessCookieOptions,
  buildClearRefreshCookieOptions,
  setRefreshCookie,
  setAccessCookie,
  clearRefreshCookie,
  clearAccessCookie,
} from './auth-cookie.util';

function configMock(values: Record<string, unknown>): ConfigService {
  return { get: <T>(key: string) => values[key] as T } as unknown as ConfigService;
}

function resMock(): Response & { cookie: jest.Mock; clearCookie: jest.Mock } {
  return {
    cookie: jest.fn(),
    clearCookie: jest.fn(),
  } as unknown as Response & { cookie: jest.Mock; clearCookie: jest.Mock };
}

describe('auth-cookie.util', () => {
  describe('readCookieFromHeader', () => {
    it('returns undefined when header is empty', () => {
      expect(readCookieFromHeader(undefined, 'p4c_rt')).toBeUndefined();
      expect(readCookieFromHeader('', 'p4c_rt')).toBeUndefined();
    });
    it('parses a single cookie', () => {
      expect(readCookieFromHeader('p4c_rt=abc', 'p4c_rt')).toBe('abc');
    });
    it('parses among multiple cookies, ignoring whitespace', () => {
      expect(readCookieFromHeader('foo=1; p4c_rt=xyz ; bar=2', 'p4c_rt')).toBe('xyz');
    });
    it('returns undefined when cookie not present', () => {
      expect(readCookieFromHeader('foo=1; bar=2', 'p4c_rt')).toBeUndefined();
    });
    it('decodes percent-encoded values', () => {
      expect(readCookieFromHeader('p4c_rt=a%20b', 'p4c_rt')).toBe('a b');
    });
    it('ignores malformed parts without "="', () => {
      expect(readCookieFromHeader('garbage; p4c_rt=ok', 'p4c_rt')).toBe('ok');
    });
  });

  describe('refreshCookieName', () => {
    it('reads from config', () => {
      expect(refreshCookieName(configMock({ 'auth.refreshCookieName': 'p4c_rt' }))).toBe('p4c_rt');
    });
  });

  describe('accessCookieName', () => {
    it('reads from config', () => {
      expect(accessCookieName(configMock({ 'auth.accessCookieName': 'p4c_at' }))).toBe('p4c_at');
    });
  });

  describe('buildRefreshCookieOptions', () => {
    it('returns httpOnly options with TTL in ms', () => {
      const opts = buildRefreshCookieOptions(
        configMock({
          'jwt.refreshTtlSecs': 60,
          'auth.refreshCookieSameSite': 'lax',
          'auth.refreshCookieSecure': false,
          'auth.cookieDomain': 'techno-volution.com',
        }),
      );
      expect(opts).toMatchObject({
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
        maxAge: 60_000,
        domain: 'techno-volution.com',
      });
    });
    it('forces secure=true when sameSite=none', () => {
      const opts = buildRefreshCookieOptions(
        configMock({
          'jwt.refreshTtlSecs': 1,
          'auth.refreshCookieSameSite': 'none',
          'auth.refreshCookieSecure': false,
          'auth.cookieDomain': 'techno-volution.com',
        }),
      );
      expect(opts.secure).toBe(true);
      expect(opts.sameSite).toBe('none');
    });
  });

  describe('buildAccessCookieOptions', () => {
    it('returns httpOnly options with access TTL in ms', () => {
      const opts = buildAccessCookieOptions(
        configMock({
          'jwt.accessTtlSecs': 90,
          'auth.refreshCookieSameSite': 'lax',
          'auth.refreshCookieSecure': false,
          'auth.cookieDomain': 'techno-volution.com',
        }),
      );
      expect(opts).toMatchObject({
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
        maxAge: 90_000,
        domain: 'techno-volution.com',
      });
    });
  });

  describe('buildClearRefreshCookieOptions', () => {
    it('omits maxAge but keeps cookie attributes', () => {
      const opts = buildClearRefreshCookieOptions(
        configMock({
          'auth.refreshCookieSameSite': 'strict',
          'auth.refreshCookieSecure': true,
          'auth.cookieDomain': 'techno-volution.com',
        }),
      );
      expect(opts).toEqual({
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/',
        domain: 'techno-volution.com',
      });
    });
  });

  describe('setRefreshCookie / clearRefreshCookie', () => {
    const cfg = configMock({
      'auth.refreshCookieName': 'p4c_rt',
      'jwt.refreshTtlSecs': 30,
      'auth.refreshCookieSameSite': 'lax',
      'auth.refreshCookieSecure': false,
      'auth.cookieDomain': 'techno-volution.com',
    });

    it('sets the named cookie with refresh options', () => {
      const res = resMock();
      setRefreshCookie(res, cfg, 'tok');
      expect(res.cookie).toHaveBeenCalledWith('p4c_rt', 'tok', expect.objectContaining({ httpOnly: true }));
    });
    it('clears the named cookie with clear options', () => {
      const res = resMock();
      clearRefreshCookie(res, cfg);
      expect(res.clearCookie).toHaveBeenCalledWith('p4c_rt', expect.objectContaining({ httpOnly: true }));
    });
  });

  describe('setAccessCookie / clearAccessCookie', () => {
    const cfg = configMock({
      'auth.accessCookieName': 'p4c_at',
      'jwt.accessTtlSecs': 30,
      'auth.refreshCookieSameSite': 'lax',
      'auth.refreshCookieSecure': false,
      'auth.cookieDomain': 'techno-volution.com',
    });

    it('sets the named cookie with access options', () => {
      const res = resMock();
      setAccessCookie(res, cfg, 'tok');
      expect(res.cookie).toHaveBeenCalledWith('p4c_at', 'tok', expect.objectContaining({ httpOnly: true }));
    });
    it('clears the named cookie with clear options', () => {
      const res = resMock();
      clearAccessCookie(res, cfg);
      expect(res.clearCookie).toHaveBeenCalledWith('p4c_at', expect.objectContaining({ httpOnly: true }));
    });
  });
});
