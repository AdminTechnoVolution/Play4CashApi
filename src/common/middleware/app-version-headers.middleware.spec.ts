import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { createAppVersionHeadersMiddleware } from './app-version-headers.middleware';

function makeConfig(minVersion: string): ConfigService {
  return { get: <T>(_k: string) => minVersion as unknown as T } as ConfigService;
}

function makeRes() {
  const headers: Record<string, string> = {};
  return {
    setHeader: (k: string, v: string) => {
      headers[k] = v;
    },
    headers,
  } as unknown as Response & { headers: Record<string, string> };
}

describe('app-version-headers middleware', () => {
  it('sets X-App-Min-Version when configured', () => {
    const mw = createAppVersionHeadersMiddleware(makeConfig('1.2.0'));
    const req = { headers: {} } as Request;
    const res = makeRes();
    const next = jest.fn();

    mw(req, res, next);

    expect((res as unknown as { headers: Record<string, string> }).headers['X-App-Min-Version']).toBe(
      '1.2.0',
    );
    expect(next).toHaveBeenCalled();
  });

  it('omits the header when minVersion is empty', () => {
    const mw = createAppVersionHeadersMiddleware(makeConfig(''));
    const req = { headers: {} } as Request;
    const res = makeRes();
    const next = jest.fn();

    mw(req, res, next);

    expect((res as unknown as { headers: Record<string, string> }).headers['X-App-Min-Version']).toBeUndefined();
  });

  it('parses X-App-Version request header into req.clientAppVersion', () => {
    const mw = createAppVersionHeadersMiddleware(makeConfig(''));
    const req = { headers: { 'x-app-version': '1.0.0' } } as unknown as Request;
    const res = makeRes();

    mw(req, res, jest.fn());

    expect((req as Request & { clientAppVersion?: string }).clientAppVersion).toBe('1.0.0');
  });

  it('handles array-typed header (rare but allowed by Express types)', () => {
    const mw = createAppVersionHeadersMiddleware(makeConfig(''));
    const req = { headers: { 'x-app-version': ['1.0.0', '2.0.0'] } } as unknown as Request;
    const res = makeRes();

    mw(req, res, jest.fn());

    expect((req as Request & { clientAppVersion?: string }).clientAppVersion).toBe('1.0.0');
  });

  it('does not set req.clientAppVersion when header is absent', () => {
    const mw = createAppVersionHeadersMiddleware(makeConfig(''));
    const req = { headers: {} } as Request;
    const res = makeRes();

    mw(req, res, jest.fn());

    expect((req as Request & { clientAppVersion?: string }).clientAppVersion).toBeUndefined();
  });
});
