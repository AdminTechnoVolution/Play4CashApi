import { Inject, Injectable, Logger } from '@nestjs/common';
import { REDIS_CLIENT } from '../redis/redis.module';

/**
 * Phase C: thin Redis-backed idempotency helper.
 *
 * Lets request handlers wrap a "create something" operation with a key derived from
 * `(userId, route, Idempotency-Key header)` so a network retry from the PWA never
 * results in two rooms / two charges / two duplicated side-effects. The result of
 * the first successful call is cached for `DEFAULT_TTL_SEC` and replayed verbatim
 * to identical retries.
 *
 * Errors are intentionally NOT cached — a 4xx/5xx is usually transient or
 * client-side, and replaying it would hide real issues from observability.
 */
@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);
  /** TTL the spec mandates is "long enough for retries but short enough to not leak across sessions". */
  static readonly DEFAULT_TTL_SEC = 300;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: any) {}

  /**
   * Returns the cached response if one exists for `key`; otherwise executes
   * `producer`, caches its JSON result, and returns it. The cache only stores
   * successful (resolved) values — rejections bubble up untouched.
   *
   * `key` should be a fully-qualified, user-scoped string built by the caller
   * (e.g. `idem:rooms:create:<userId>:<idempKey>`); the service itself is unopinionated
   * about format to keep concerns separated.
   */
  async getOrSet<T>(key: string, ttlSec: number, producer: () => Promise<T>): Promise<T> {
    try {
      const cached = await this.redis.get(key);
      if (cached) {
        this.logger.log(`event=idempotency_hit key=${key}`);
        return JSON.parse(cached) as T;
      }
    } catch (e) {
      // If Redis is down we still want to honor the request — degrade gracefully
      // by skipping the cache. Worst case: a retry succeeds twice, which is the
      // pre-Phase-C behaviour and is already mitigated by the partial unique index.
      this.logger.warn(`[Idempotency] read failed key=${key}: ${(e as Error)?.message}`);
    }

    const result = await producer();
    try {
      await this.redis.set(key, JSON.stringify(result), 'EX', ttlSec);
    } catch (e) {
      this.logger.warn(`[Idempotency] write failed key=${key}: ${(e as Error)?.message}`);
    }
    return result;
  }
}
