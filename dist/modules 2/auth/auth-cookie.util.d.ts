import type { CookieOptions, Response } from 'express';
import type { ConfigService } from '@nestjs/config';
export declare function readCookieFromHeader(cookieHeader: string | undefined, name: string): string | undefined;
export declare function refreshCookieName(config: ConfigService): string;
export declare function buildRefreshCookieOptions(config: ConfigService): CookieOptions;
export declare function buildClearRefreshCookieOptions(config: ConfigService): CookieOptions;
export declare function setRefreshCookie(res: Response, config: ConfigService, refreshToken: string): void;
export declare function clearRefreshCookie(res: Response, config: ConfigService): void;
