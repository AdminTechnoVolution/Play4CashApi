import type { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';

/**
 * Adds the `X-App-Min-Version` header on every response when `PWA_MIN_VERSION` is configured.
 * The PWA reads it, compares against `__APP_VERSION__`, and forces an upgrade modal if it
 * is running an older build.
 *
 * Also reads the client-supplied `X-App-Version` request header and stashes it on
 * `req.clientAppVersion` for downstream loggers/metrics.
 */
export function createAppVersionHeadersMiddleware(config: ConfigService) {
  const minVersion = config.get<string>('pwa.minVersion') || '';

  return (req: Request, res: Response, next: NextFunction): void => {
    if (minVersion) {
      res.setHeader('X-App-Min-Version', minVersion);
    }
    const incoming = req.headers['x-app-version'];
    const clientVersion = Array.isArray(incoming) ? incoming[0] : incoming;
    if (clientVersion) {
      (req as Request & { clientAppVersion?: string }).clientAppVersion = String(clientVersion);
    }
    next();
  };
}
