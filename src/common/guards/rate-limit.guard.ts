import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { REDIS_CLIENT } from '../redis/redis.module';
import { RATE_LIMIT_KEY, RateLimitOptions } from '../rate-limit/rate-limit.decorator';

interface RateLimitCheck {
  allowed: boolean;
  remaining: number;
  ttlMs: number;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: any,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;

    const request = context.switchToHttp().getRequest<Request & { ip?: string; ips?: string[] }>();
    const response = context.switchToHttp().getResponse<Response>();
    const clientIp = normalizeIp(this.resolveClientIp(request));
    const globalLimit = this.getDefaultLimit();
    const globalTtlMs = this.getDefaultTtlMs();

    const routeOptions =
      this.reflector.getAllAndOverride<RateLimitOptions | undefined>(RATE_LIMIT_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? undefined;

    try {
      if (routeOptions) {
        const routeCheck = await this.consume({
          key: `rate-limit:route:${this.getRouteKey(context)}:${clientIp}`,
          ttlMs: routeOptions.ttlMs ?? globalTtlMs,
          limit: routeOptions.limit ?? globalLimit,
        });

        if (!routeCheck.allowed) {
          this.applyRateLimitHeaders(response, routeOptions.limit ?? globalLimit, routeCheck);
          throw this.tooManyRequests(routeOptions.limit ?? globalLimit, routeCheck, context);
        }
      }

      const globalCheck = await this.consume({
        key: `rate-limit:global:${clientIp}`,
        ttlMs: globalTtlMs,
        limit: globalLimit,
      });

      if (!globalCheck.allowed) {
        this.applyRateLimitHeaders(response, globalLimit, globalCheck);
        throw this.tooManyRequests(globalLimit, globalCheck, context);
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;
      console.error('[RateLimitGuard] Rate limit backend error', error);
      this.applyRateLimitHeaders(response, globalLimit, { allowed: false, remaining: 0, ttlMs: globalTtlMs });
      throw this.tooManyRequests(globalLimit, { allowed: false, remaining: 0, ttlMs: globalTtlMs }, context);
    }

    return true;
  }

  private async consume(input: { key: string; ttlMs: number; limit: number }): Promise<RateLimitCheck> {
    const ttlMs = Math.max(1, Math.trunc(input.ttlMs));
    const limit = Math.max(1, Math.trunc(input.limit));
    const script = `
      local current = redis.call('INCR', KEYS[1])
      if current == 1 then
        redis.call('PEXPIRE', KEYS[1], ARGV[1])
      end
      local ttl = redis.call('PTTL', KEYS[1])
      if ttl < 0 then
        redis.call('PEXPIRE', KEYS[1], ARGV[1])
        ttl = ARGV[1]
      end
      if current > tonumber(ARGV[2]) then
        return {0, ttl, 0}
      end
      return {tonumber(ARGV[2]) - current, ttl, 1}
    `;
    const result = (await this.redis.eval(script, {
      keys: [input.key],
      arguments: [String(ttlMs), String(limit)],
    })) as Array<string | number>;

    const remaining = Number(result?.[0] ?? 0);
    const ttl = Number(result?.[1] ?? ttlMs);
    const allowed = Number(result?.[2] ?? 0) === 1;

    return {
      allowed,
      remaining: Number.isFinite(remaining) ? remaining : 0,
      ttlMs: Number.isFinite(ttl) && ttl > 0 ? ttl : ttlMs,
    };
  }

  private getDefaultLimit(): number {
    return this.getPositiveInt('throttle.limit', 50);
  }

  private getDefaultTtlMs(): number {
    return this.getPositiveInt('throttle.ttlMs', 60_000);
  }

  private getPositiveInt(path: string, fallback: number): number {
    const value = this.config.get<number>(path);
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return fallback;
    return Math.trunc(value);
  }

  private resolveClientIp(request: Request & { ip?: string; ips?: string[] }): string {
    const ip =
      request.ip ||
      (Array.isArray(request.ips) && request.ips.length > 0 ? request.ips[0] : undefined) ||
      request.socket?.remoteAddress ||
      this.extractForwardedFor(request.headers['x-forwarded-for']);

    return ip || 'unknown';
  }

  private extractForwardedFor(value: unknown): string | undefined {
    if (typeof value !== 'string' || !value.trim()) return undefined;
    return value.split(',')[0]?.trim();
  }

  private getRouteKey(context: ExecutionContext): string {
    const controller = context.getClass()?.name || 'UnknownController';
    const handler = context.getHandler()?.name || 'unknownHandler';
    return `${controller}.${handler}`;
  }

  private applyRateLimitHeaders(response: Response, limit: number, check: RateLimitCheck): void {
    response.setHeader('Retry-After', String(Math.max(1, Math.ceil(check.ttlMs / 1000))));
    response.setHeader('X-RateLimit-Limit', String(limit));
    response.setHeader('X-RateLimit-Remaining', String(Math.max(0, check.remaining)));
    response.setHeader('X-RateLimit-Reset', String(Date.now() + check.ttlMs));
  }

  private tooManyRequests(limit: number, check: RateLimitCheck, context: ExecutionContext): HttpException {
    return new HttpException({
      message: 'ERROR_RATE_LIMIT_EXCEEDED',
      limit,
      remaining: Math.max(0, check.remaining),
      resetAt: Date.now() + check.ttlMs,
      path: context.switchToHttp().getRequest<Request>().url,
    }, HttpStatus.TOO_MANY_REQUESTS);
  }
}

function normalizeIp(ip: string): string {
  if (!ip) return 'unknown';
  return ip.startsWith('::ffff:') ? ip.slice('::ffff:'.length) : ip;
}
