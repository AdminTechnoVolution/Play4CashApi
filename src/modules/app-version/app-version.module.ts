import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AppVersionController } from './app-version.controller';
import { AppVersionStatsInterceptor } from './app-version-stats.interceptor';
import { AppVersionStatsService } from './app-version-stats.service';

/**
 * Tracks the distribution of `X-App-Version` headers received from the PWA.
 *
 * - `AppVersionStatsService` (Redis-backed daily counters).
 * - `AppVersionStatsInterceptor` registered globally so every HTTP request feeds the sampler.
 * - `AppVersionController` exposes `GET /api/admin/app-versions/stats` for ops dashboards.
 *
 * Pairs with the `app-version-headers` middleware in `main.ts` which parses the request
 * header into `req.clientAppVersion` and emits the response header `X-App-Min-Version`.
 */
@Module({
  controllers: [AppVersionController],
  providers: [
    AppVersionStatsService,
    { provide: APP_INTERCEPTOR, useClass: AppVersionStatsInterceptor },
  ],
  exports: [AppVersionStatsService],
})
export class AppVersionModule {}
