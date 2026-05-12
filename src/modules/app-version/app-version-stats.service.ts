import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RedisClientType } from 'redis';
import { REDIS_CLIENT } from '../../common/redis/redis.module';
import {
  REDIS_KEY_APP_VERSION_DAILY,
  REDIS_KEY_APP_VERSION_STALE,
} from '../../common/constants/redis-keys.constants';
import { compareSemver } from './semver-compare.util';

const MAX_VERSION_STRING_LEN = 32;

export interface DailyVersionBucket {
  /** YYYY-MM-DD (UTC). */
  date: string;
  /** Map of version string -> request count. */
  versions: Record<string, number>;
  /** Subset of `versions` that fell below `PWA_MIN_VERSION` at the time of the request. */
  staleVersions: Record<string, number>;
}

export interface AppVersionStatsSummary {
  /** Per-day buckets, oldest first. */
  daily: DailyVersionBucket[];
  /** Aggregate version -> count over the whole window. */
  totals: Record<string, number>;
  /** Aggregate stale version -> count. */
  staleTotals: Record<string, number>;
  /** Currently configured minimum version, if any. */
  currentMinVersion: string | null;
  /** Sample rate active when the stats were collected. Useful to estimate true volume. */
  sampleRate: number;
  /** True when one or more daily bucket reads failed (e.g. Redis unreachable). */
  degraded: boolean;
}

/**
 * Daily Redis counters of `X-App-Version` request headers (sampled). Used by the admin
 * endpoint to show how the user base is migrating across builds and how many clients are
 * stuck below `PWA_MIN_VERSION`.
 *
 * Storage: `appVersionDaily:<YYYY-MM-DD>` and `appVersionStale:<YYYY-MM-DD>` are Redis
 * HASHes whose fields are the version strings. TTL is set to `statsRetentionDays * 86400`.
 */
@Injectable()
export class AppVersionStatsService {
  private readonly logger = new Logger(AppVersionStatsService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: RedisClientType,
    private readonly config: ConfigService,
  ) {}

  /** Sample rate in 0..1. Drives the interceptor's per-request decision. */
  getSampleRate(): number {
    return this.config.get<number>('pwa.statsSampleRate') ?? 0.1;
  }

  getMinVersion(): string {
    return this.config.get<string>('pwa.minVersion') || '';
  }

  /**
   * Fire-and-forget. Does not throw; logs at debug level on Redis failure.
   * Caller should NOT await this in the hot path.
   */
  async record(version: string): Promise<void> {
    const sanitized = sanitizeVersion(version);
    if (!sanitized) return;

    const dayKey = todayKey();
    const ttlSecs = (this.config.get<number>('pwa.statsRetentionDays') ?? 31) * 86400;
    const minVersion = this.getMinVersion();
    const isStale = !!minVersion && compareSemver(sanitized, minVersion) < 0;

    try {
      const dailyKey = REDIS_KEY_APP_VERSION_DAILY + dayKey;
      await this.redis.hIncrBy(dailyKey, sanitized, 1);
      await this.redis.expire(dailyKey, ttlSecs);

      if (isStale) {
        const staleKey = REDIS_KEY_APP_VERSION_STALE + dayKey;
        await this.redis.hIncrBy(staleKey, sanitized, 1);
        await this.redis.expire(staleKey, ttlSecs);
      }
    } catch (err) {
      this.logger.debug(`record() failed: ${(err as Error).message}`);
    }
  }

  /** Reads the last `days` daily buckets (most recent first when iterating dates downward). */
  async getStats(days: number): Promise<AppVersionStatsSummary> {
    const window = clampWindow(days);
    const dates = lastNDates(window);

    const daily: DailyVersionBucket[] = [];
    const totals: Record<string, number> = {};
    const staleTotals: Record<string, number> = {};
    let degraded = false;

    for (const date of dates) {
      const versionsResult = await this.readHash(REDIS_KEY_APP_VERSION_DAILY + date);
      const staleResult = await this.readHash(REDIS_KEY_APP_VERSION_STALE + date);
      if (!versionsResult.ok || !staleResult.ok) degraded = true;

      const versions = versionsResult.data;
      const staleVersions = staleResult.data;
      daily.push({ date, versions, staleVersions });

      for (const [v, count] of Object.entries(versions)) {
        totals[v] = (totals[v] ?? 0) + count;
      }
      for (const [v, count] of Object.entries(staleVersions)) {
        staleTotals[v] = (staleTotals[v] ?? 0) + count;
      }
    }

    return {
      daily,
      totals,
      staleTotals,
      currentMinVersion: this.getMinVersion() || null,
      sampleRate: this.getSampleRate(),
      degraded,
    };
  }

  private async readHash(key: string): Promise<{ ok: boolean; data: Record<string, number> }> {
    try {
      const raw = await this.redis.hGetAll(key);
      const out: Record<string, number> = {};
      for (const [k, v] of Object.entries(raw)) {
        const n = parseInt(v as string, 10);
        if (Number.isFinite(n)) out[k] = n;
      }
      return { ok: true, data: out };
    } catch (err) {
      this.logger.debug(`readHash(${key}) failed: ${(err as Error).message}`);
      return { ok: false, data: {} };
    }
  }
}

/** Accept only ascii printable, cap length, drop empty. Prevents Redis key abuse via header. */
function sanitizeVersion(input: string): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim().slice(0, MAX_VERSION_STRING_LEN);
  if (!trimmed) return null;
  if (!/^[\w.+\-]+$/.test(trimmed)) return null;
  return trimmed;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function lastNDates(n: number): string[] {
  const out: string[] = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function clampWindow(days: number): number {
  if (!Number.isFinite(days)) return 7;
  return Math.min(60, Math.max(1, Math.floor(days)));
}
