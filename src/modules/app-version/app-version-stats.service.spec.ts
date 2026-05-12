import { ConfigService } from '@nestjs/config';
import { AppVersionStatsService } from './app-version-stats.service';

interface FakeHash {
  [field: string]: number;
}

function makeFakeRedis() {
  const store = new Map<string, FakeHash>();
  const expirations = new Map<string, number>();

  return {
    store,
    expirations,
    async hIncrBy(key: string, field: string, by: number): Promise<number> {
      const h = store.get(key) ?? {};
      h[field] = (h[field] ?? 0) + by;
      store.set(key, h);
      return h[field];
    },
    async expire(key: string, ttlSecs: number): Promise<number> {
      expirations.set(key, ttlSecs);
      return 1;
    },
    async hGetAll(key: string): Promise<Record<string, string>> {
      const h = store.get(key) ?? {};
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(h)) out[k] = String(v);
      return out;
    },
  };
}

function makeConfig(overrides: Record<string, unknown> = {}): ConfigService {
  const values: Record<string, unknown> = {
    'pwa.minVersion': '',
    'pwa.statsSampleRate': 0.1,
    'pwa.statsRetentionDays': 31,
    ...overrides,
  };
  return { get: <T>(k: string) => values[k] as T } as ConfigService;
}

function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

describe('AppVersionStatsService', () => {
  describe('record', () => {
    it('increments daily HASH and sets TTL', async () => {
      const redis = makeFakeRedis();
      const svc = new AppVersionStatsService(redis as never, makeConfig());

      await svc.record('1.2.3');

      const today = todayUTC();
      const dailyKey = 'appVersionDaily:' + today;
      expect(redis.store.get(dailyKey)).toEqual({ '1.2.3': 1 });
      expect(redis.expirations.get(dailyKey)).toBe(31 * 86400);
    });

    it('also increments stale HASH when client < minVersion', async () => {
      const redis = makeFakeRedis();
      const svc = new AppVersionStatsService(
        redis as never,
        makeConfig({ 'pwa.minVersion': '2.0.0' }),
      );

      await svc.record('1.9.0');

      const today = todayUTC();
      expect(redis.store.get('appVersionDaily:' + today)).toEqual({ '1.9.0': 1 });
      expect(redis.store.get('appVersionStale:' + today)).toEqual({ '1.9.0': 1 });
    });

    it('does not increment stale when client == minVersion', async () => {
      const redis = makeFakeRedis();
      const svc = new AppVersionStatsService(
        redis as never,
        makeConfig({ 'pwa.minVersion': '2.0.0' }),
      );

      await svc.record('2.0.0');

      const today = todayUTC();
      expect(redis.store.get('appVersionDaily:' + today)).toEqual({ '2.0.0': 1 });
      expect(redis.store.get('appVersionStale:' + today)).toBeUndefined();
    });

    it('rejects empty and forbidden-character version strings', async () => {
      const redis = makeFakeRedis();
      const svc = new AppVersionStatsService(redis as never, makeConfig());

      await svc.record('   ');
      await svc.record('1.2.3 OR 1=1');
      await svc.record('javascript:alert(1)');

      expect(redis.store.size).toBe(0);
    });

    it('truncates very long version strings to MAX 32 chars before storing', async () => {
      const redis = makeFakeRedis();
      const svc = new AppVersionStatsService(redis as never, makeConfig());

      const longButValid = '1.' + '2'.repeat(60);
      await svc.record(longButValid);

      const today = todayUTC();
      const stored = redis.store.get('appVersionDaily:' + today)!;
      const fields = Object.keys(stored);
      expect(fields).toHaveLength(1);
      expect(fields[0].length).toBeLessThanOrEqual(32);
    });

    it('accepts valid +build suffix', async () => {
      const redis = makeFakeRedis();
      const svc = new AppVersionStatsService(redis as never, makeConfig());

      await svc.record('1.2.3+abc1234');

      const today = todayUTC();
      expect(redis.store.get('appVersionDaily:' + today)).toEqual({ '1.2.3+abc1234': 1 });
    });

    it('swallows Redis errors silently', async () => {
      const redis = {
        async hIncrBy() {
          throw new Error('boom');
        },
        async expire() {
          return 1;
        },
        async hGetAll() {
          return {};
        },
      };
      const svc = new AppVersionStatsService(redis as never, makeConfig());

      await expect(svc.record('1.2.3')).resolves.toBeUndefined();
    });
  });

  describe('getStats', () => {
    it('aggregates totals across the requested window', async () => {
      const redis = makeFakeRedis();
      const today = todayUTC();
      const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
      redis.store.set('appVersionDaily:' + today, { '1.2.3': 5, '1.2.4': 2 });
      redis.store.set('appVersionDaily:' + yesterday, { '1.2.3': 3 });
      redis.store.set('appVersionStale:' + today, { '1.2.3': 1 });

      const svc = new AppVersionStatsService(
        redis as never,
        makeConfig({ 'pwa.minVersion': '1.2.4', 'pwa.statsSampleRate': 0.5 }),
      );

      const summary = await svc.getStats(2);

      expect(summary.daily).toHaveLength(2);
      expect(summary.totals).toEqual({ '1.2.3': 8, '1.2.4': 2 });
      expect(summary.staleTotals).toEqual({ '1.2.3': 1 });
      expect(summary.currentMinVersion).toBe('1.2.4');
      expect(summary.sampleRate).toBe(0.5);
      expect(summary.degraded).toBe(false);
    });

    it('marks degraded=true when Redis reads fail', async () => {
      const redis = {
        async hGetAll() {
          throw new Error('redis down');
        },
      };
      const svc = new AppVersionStatsService(redis as never, makeConfig());

      const summary = await svc.getStats(3);

      expect(summary.degraded).toBe(true);
      expect(summary.daily).toHaveLength(3);
      expect(summary.totals).toEqual({});
    });

    it('clamps days to 1..60', async () => {
      const redis = makeFakeRedis();
      const svc = new AppVersionStatsService(redis as never, makeConfig());

      const tiny = await svc.getStats(0);
      const huge = await svc.getStats(9999);

      expect(tiny.daily).toHaveLength(1);
      expect(huge.daily).toHaveLength(60);
    });
  });
});
