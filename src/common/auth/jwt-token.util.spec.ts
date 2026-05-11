import type { ConfigService } from '@nestjs/config';
import {
  jwtVerifyOptions,
  isAccessTokenPayload,
  isRefreshTokenPayload,
} from './jwt-token.util';

function configMock(values: Record<string, unknown>): ConfigService {
  return { get: <T>(key: string) => values[key] as T } as unknown as ConfigService;
}

describe('jwt-token.util', () => {
  describe('jwtVerifyOptions', () => {
    it('reads issuer and audience from config', () => {
      const opts = jwtVerifyOptions(configMock({ 'jwt.issuer': 'p4c', 'jwt.audience': 'p4c-clients' }));
      expect(opts).toEqual({ issuer: 'p4c', audience: 'p4c-clients' });
    });
    it('returns undefined values when keys are absent', () => {
      const opts = jwtVerifyOptions(configMock({}));
      expect(opts.issuer).toBeUndefined();
      expect(opts.audience).toBeUndefined();
    });
  });

  describe('isAccessTokenPayload', () => {
    it('accepts only objects with typ === access', () => {
      expect(isAccessTokenPayload({ typ: 'access' })).toBe(true);
      expect(isAccessTokenPayload({ typ: 'refresh' })).toBe(false);
      expect(isAccessTokenPayload({})).toBe(false);
      expect(isAccessTokenPayload(null)).toBe(false);
      expect(isAccessTokenPayload('access')).toBe(false);
    });
  });

  describe('isRefreshTokenPayload', () => {
    it('accepts only objects with typ === refresh', () => {
      expect(isRefreshTokenPayload({ typ: 'refresh' })).toBe(true);
      expect(isRefreshTokenPayload({ typ: 'access' })).toBe(false);
      expect(isRefreshTokenPayload(undefined)).toBe(false);
    });
  });
});
