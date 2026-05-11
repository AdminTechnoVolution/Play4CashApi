import type { ConfigService } from '@nestjs/config';
import type { VerifyOptions } from 'jsonwebtoken';

export function jwtVerifyOptions(config: ConfigService): VerifyOptions {
  return {
    issuer: config.get<string>('jwt.issuer'),
    audience: config.get<string>('jwt.audience'),
  };
}

export function isAccessTokenPayload(payload: unknown): payload is Record<string, unknown> & { typ: 'access' } {
  return typeof payload === 'object' && payload !== null && (payload as { typ?: string }).typ === 'access';
}

export function isRefreshTokenPayload(payload: unknown): payload is Record<string, unknown> & { typ: 'refresh' } {
  return typeof payload === 'object' && payload !== null && (payload as { typ?: string }).typ === 'refresh';
}
