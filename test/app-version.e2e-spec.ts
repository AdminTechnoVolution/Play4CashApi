import { INestApplication, HttpStatus } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import request from 'supertest';
import { Server } from 'http';
import { AppVersionController } from '../src/modules/app-version/app-version.controller';
import { AppVersionStatsService } from '../src/modules/app-version/app-version-stats.service';
import { REDIS_CLIENT } from '../src/common/redis/redis.module';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { Reflector } from '@nestjs/core';
import { RateLimitGuard } from '../src/common/guards/rate-limit.guard';

interface FakeRedis {
  store: Map<string, Record<string, number>>;
  hGetAll: jest.Mock;
  eval: jest.Mock;
}

function makeFakeRedis(opts: { failHash?: boolean } = {}): FakeRedis {
  const store = new Map<string, Record<string, number>>();
  return {
    store,
    hGetAll: jest.fn(async (key: string) => {
      if (opts.failHash) throw new Error('redis down');
      const h = store.get(key) ?? {};
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(h)) out[k] = String(v);
      return out;
    }),
    eval: jest.fn(async (_script: string, options: { keys: string[]; arguments: string[] }) => {
      const key = options.keys[0];
      const ttlMs = Number(options.arguments[0]);
      const limit = Number(options.arguments[1]);
      const bucket = store.get(key) ?? { count: 0, expiresAt: Date.now() + ttlMs };
      if (bucket.expiresAt <= Date.now()) {
        bucket.count = 0;
        bucket.expiresAt = Date.now() + ttlMs;
      }
      bucket.count += 1;
      store.set(key, bucket);
      const remainingTtl = Math.max(1, bucket.expiresAt - Date.now());
      const allowed = bucket.count <= limit;
      return [Math.max(0, limit - bucket.count), remainingTtl, allowed ? 1 : 0];
    }),
  };
}

/**
 * In the real app `AuthGuard` is global (via `APP_GUARD`) and runs first to populate
 * `req.user`; then `RolesGuard` checks `user.role === 'admin'`. Here we don't bring up
 * the real AuthGuard (would need JWT secret + Redis). We replace `RolesGuard` with a
 * stub that always allows. Authentication is exercised in `auth.guard.spec.ts`.
 */
class StubRolesGuard {
  canActivate(): boolean {
    return true;
  }
}

async function buildApp(redis: FakeRedis): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        ignoreEnvFile: true,
        load: [
          () => ({
            'pwa.minVersion': '2.0.0',
            'pwa.statsSampleRate': 0.0,
            'pwa.statsRetentionDays': 7,
            'admin.emails': [],
            'throttle.limit': 50,
            'throttle.ttlMs': 60_000,
          }),
        ],
      }),
    ],
    controllers: [AppVersionController],
    providers: [
      AppVersionStatsService,
      Reflector,
      { provide: REDIS_CLIENT, useValue: redis },
      { provide: APP_GUARD, useClass: RateLimitGuard },
    ],
  })
    .overrideGuard(RolesGuard)
    .useValue(new StubRolesGuard())
    .compile();

  const app = moduleFixture.createNestApplication();
  await app.init();
  return app;
}

describe('GET /admin/app-versions/stats (e2e)', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app?.close();
  });

  it('returns aggregated stats from Redis', async () => {
    const redis = makeFakeRedis();
    const today = new Date().toISOString().slice(0, 10);
    redis.store.set('appVersionDaily:' + today, { '1.0.0': 3, '1.1.0': 7 });
    redis.store.set('appVersionStale:' + today, { '1.0.0': 3 });

    app = await buildApp(redis);
    const httpServer = app.getHttpServer() as Server;

    const res = await request(httpServer)
      .get('/admin/app-versions/stats?days=1')
      .set('Authorization', 'Bearer test-token');

    expect(res.status).toBe(200);
    expect(res.body.totals).toEqual({ '1.0.0': 3, '1.1.0': 7 });
    expect(res.body.staleTotals).toEqual({ '1.0.0': 3 });
    expect(res.body.currentMinVersion).toBe('2.0.0');
    expect(res.body.degraded).toBe(false);
  });

  it('clamps days to a valid range', async () => {
    const redis = makeFakeRedis();
    app = await buildApp(redis);
    const httpServer = app.getHttpServer() as Server;

    const tiny = await request(httpServer).get('/admin/app-versions/stats?days=0');
    const huge = await request(httpServer).get('/admin/app-versions/stats?days=9999');

    expect(tiny.body.daily).toHaveLength(1);
    expect(huge.body.daily).toHaveLength(60);
  });

  it('returns 503 when Redis is fully degraded and no buckets have data', async () => {
    const redis = makeFakeRedis({ failHash: true });
    app = await buildApp(redis);
    const httpServer = app.getHttpServer() as Server;

    const res = await request(httpServer).get('/admin/app-versions/stats?days=2');

    expect(res.status).toBe(HttpStatus.SERVICE_UNAVAILABLE);
    expect(res.body.message).toBe('Stats backend unavailable');
    expect(res.body.summary?.degraded).toBe(true);
  });
});
