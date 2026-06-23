import type { CookieOptions, Response } from 'express';
import type { ConfigService } from '@nestjs/config';

export function readCookieFromHeader(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    if (k !== name) continue;
    return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return undefined;
}

export function refreshCookieName(config: ConfigService): string {
  return config.get<string>('auth.refreshCookieName')!;
}

export function accessCookieName(config: ConfigService): string {
  return config.get<string>('auth.accessCookieName')!;
}

function buildCookieOptions(
  config: ConfigService,
  ttlSecs: number,
): CookieOptions {
  const sameSite = config.get<'lax' | 'strict' | 'none'>('auth.refreshCookieSameSite')!;
  let secure = config.get<boolean>('auth.refreshCookieSecure')!;
  if (sameSite === 'none' && !secure) {
    secure = true;
  }
  return {
    httpOnly: true,
    secure,
    sameSite,
    maxAge: ttlSecs * 1000,
    path: '/',
  };
}

export function buildRefreshCookieOptions(config: ConfigService): CookieOptions {
  const refreshTtlSecs = config.get<number>('jwt.refreshTtlSecs')!;
  return buildCookieOptions(config, refreshTtlSecs);
}

export function buildAccessCookieOptions(config: ConfigService): CookieOptions {
  const accessTtlSecs = config.get<number>('jwt.accessTtlSecs')!;
  return buildCookieOptions(config, accessTtlSecs);
}

export function buildClearRefreshCookieOptions(config: ConfigService): CookieOptions {
  const sameSite = config.get<'lax' | 'strict' | 'none'>('auth.refreshCookieSameSite')!;
  let secure = config.get<boolean>('auth.refreshCookieSecure')!;
  if (sameSite === 'none' && !secure) {
    secure = true;
  }
  return {
    httpOnly: true,
    secure,
    sameSite,
    path: '/',
  };
}

export function setRefreshCookie(res: Response, config: ConfigService, refreshToken: string): void {
  const name = refreshCookieName(config);
  res.cookie(name, refreshToken, buildRefreshCookieOptions(config));
}

export function setAccessCookie(res: Response, config: ConfigService, accessToken: string): void {
  const name = accessCookieName(config);
  res.cookie(name, accessToken, buildAccessCookieOptions(config));
}

export function clearRefreshCookie(res: Response, config: ConfigService): void {
  const name = refreshCookieName(config);
  res.clearCookie(name, buildClearRefreshCookieOptions(config));
}

export function clearAccessCookie(res: Response, config: ConfigService): void {
  const name = accessCookieName(config);
  res.clearCookie(name, buildClearRefreshCookieOptions(config));
}
