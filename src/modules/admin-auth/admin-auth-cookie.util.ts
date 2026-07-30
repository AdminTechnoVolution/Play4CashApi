import type { CookieOptions, Response } from 'express';
import type { ConfigService } from '@nestjs/config';

export const ADMIN_ACCESS_COOKIE = 'p4c_admin_access';
export const ADMIN_REFRESH_COOKIE = 'p4c_admin_refresh';

function options(config: ConfigService, ttlSecs?: number): CookieOptions {
  const sameSite = config.get<'lax' | 'strict' | 'none'>('auth.refreshCookieSameSite')!;
  let secure = config.get<boolean>('auth.refreshCookieSecure')!;
  if (sameSite === 'none') secure = true;
  const cookie: CookieOptions = {
    httpOnly: true,
    secure,
    sameSite,
    path: '/',
    ...(ttlSecs ? { maxAge: ttlSecs * 1000 } : {}),
  };
  const domain = config.get<string>('auth.cookieDomain');
  if (domain) cookie.domain = domain;
  return cookie;
}

export function readNamedCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return undefined;
}

export function setAdminCookies(
  response: Response,
  config: ConfigService,
  accessToken: string,
  refreshToken: string,
): void {
  response.cookie(
    ADMIN_ACCESS_COOKIE,
    accessToken,
    options(config, config.get<number>('adminAuth.accessTtlSecs')!),
  );
  response.cookie(
    ADMIN_REFRESH_COOKIE,
    refreshToken,
    options(config, config.get<number>('adminAuth.refreshTtlSecs')!),
  );
}

export function clearAdminCookies(response: Response, config: ConfigService): void {
  response.clearCookie(ADMIN_ACCESS_COOKIE, options(config));
  response.clearCookie(ADMIN_REFRESH_COOKIE, options(config));
}
