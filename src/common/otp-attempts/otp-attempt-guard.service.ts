import { Inject, Injectable } from '@nestjs/common';
import { REDIS_CLIENT } from '../redis/redis.module';

/**
 * Per-record failed-OTP-attempt counter, independent of the caller's IP.
 *
 * The route-level `RateLimitGuard` throttles by client IP, which a stolen-session
 * attacker defeats trivially by rotating source IPs — the 6-digit code space
 * (1,000,000 values) is small enough to brute-force that way. Scoping the counter
 * to the specific pending record's Mongo `_id` means it survives IP rotation and
 * naturally resets whenever the user requests a fresh code (a new record gets a
 * new `_id`).
 */
@Injectable()
export class OtpAttemptGuardService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: any) {}

  /** Records a failed verification attempt and reports whether the limit was exceeded. */
  async registerFailure(scopeKey: string, maxAttempts: number, ttlMs: number): Promise<boolean> {
    const key = `otp-attempts:${scopeKey}`;
    const script = `
      local current = redis.call('INCR', KEYS[1])
      if current == 1 then
        redis.call('PEXPIRE', KEYS[1], ARGV[1])
      end
      return current
    `;
    const attempts = Number(
      await this.redis.eval(script, {
        keys: [key],
        arguments: [String(Math.max(1, Math.trunc(ttlMs)))],
      }),
    );
    return attempts > maxAttempts;
  }

  /** Clears the counter — call on successful verification or when the record is invalidated. */
  async clear(scopeKey: string): Promise<void> {
    await this.redis.del(`otp-attempts:${scopeKey}`);
  }
}
