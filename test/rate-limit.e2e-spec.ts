import { INestApplication } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { UserController } from '../src/modules/user/user.controller';
import { UserService } from '../src/modules/user/user.service';
import { RateLimitGuard } from '../src/common/guards/rate-limit.guard';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { I18nService } from '../src/common/i18n/i18n.service';
import { REDIS_CLIENT } from '../src/common/redis/redis.module';
import { Reflector } from '@nestjs/core';

interface FakeRedis {
  eval: jest.Mock;
}

function makeFakeRedis(): FakeRedis {
  const store = new Map<string, { count: number; expiresAt: number }>();
  return {
    eval: jest.fn(async (_script: string, options: { keys: string[]; arguments: string[] }) => {
      const key = options.keys[0];
      const ttlMs = Number(options.arguments[0]);
      const limit = Number(options.arguments[1]);
      const now = Date.now();
      let bucket = store.get(key);
      if (!bucket || bucket.expiresAt <= now) {
        bucket = { count: 0, expiresAt: now + ttlMs };
      }
      bucket.count += 1;
      store.set(key, bucket);
      const remainingTtl = Math.max(1, bucket.expiresAt - now);
      return [Math.max(0, limit - bucket.count), remainingTtl, bucket.count <= limit ? 1 : 0];
    }),
  };
}

describe('IP rate limit e2e', () => {
  let app: INestApplication;

  afterEach(async () => {
    await app?.close();
  });

  async function buildApp(redis: FakeRedis, throttleLimit = 2): Promise<INestApplication> {
    const userService = {
      getPublicUserStats: jest.fn(async () => ({ success: true, data: { total: 123 } })),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          load: [
            () => ({
              'throttle.limit': throttleLimit,
              'throttle.ttlMs': 60_000,
            }),
          ],
        }),
      ],
      controllers: [UserController],
      providers: [
        I18nService,
        Reflector,
        { provide: REDIS_CLIENT, useValue: redis },
        { provide: APP_GUARD, useClass: RateLimitGuard },
        { provide: APP_FILTER, useClass: GlobalExceptionFilter },
        { provide: UserService, useValue: userService },
      ],
    })
      .compile();

    const testApp = moduleFixture.createNestApplication();
    testApp.setGlobalPrefix('api');
    await testApp.init();
    return testApp;
  }

  it('returns 429 after the same IP exceeds the configured limit', async () => {
    app = await buildApp(makeFakeRedis(), 2);
    const httpServer = app.getHttpServer();

    const first = await request(httpServer).get('/api/user/public/stats');
    const second = await request(httpServer).get('/api/user/public/stats');
    const third = await request(httpServer).get('/api/user/public/stats');

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(429);
    expect(third.body.success).toBe(false);
    expect(third.body.messages).toContain('Too many requests. Please try again later.');
  });
});
