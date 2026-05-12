import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { AppVersionStatsService } from './app-version-stats.service';

/**
 * Records the client's `X-App-Version` (already extracted by `app-version-headers` middleware
 * into `req.clientAppVersion`) into Redis counters. Sampled to keep Redis load bounded.
 *
 * Fire-and-forget: never blocks the response and silently swallows failures (the stats
 * service logs at debug level). Skips entirely when the request is not HTTP (e.g. WS).
 */
@Injectable()
export class AppVersionStatsInterceptor implements NestInterceptor {
  constructor(private readonly stats: AppVersionStatsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() === 'http') {
      const sampleRate = this.stats.getSampleRate();
      if (sampleRate > 0 && Math.random() < sampleRate) {
        const req = context.switchToHttp().getRequest<{ clientAppVersion?: string }>();
        const version = req?.clientAppVersion;
        if (version) {
          // Intentionally not awaited; runs alongside the response handler.
          // Belt-and-braces .catch() in case the service grows a code path that doesn't
          // swallow internally — an unhandled rejection here would crash the process.
          this.stats.record(version).catch(() => {
            /* swallowed: stats are best-effort */
          });
        }
      }
    }
    return next.handle();
  }
}
