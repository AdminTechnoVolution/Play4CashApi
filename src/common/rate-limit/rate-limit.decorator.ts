import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rateLimit';

export interface RateLimitOptions {
  limit?: number;
  ttlMs?: number;
  key?: string;
}

/**
 * Route-level override for the global IP rate limiter.
 * When omitted, the request uses the global default configured in `THROTTLE_LIMIT` / `THROTTLE_TTL_MS`.
 */
export const RateLimit = (options: RateLimitOptions): MethodDecorator & ClassDecorator =>
  SetMetadata(RATE_LIMIT_KEY, options);
