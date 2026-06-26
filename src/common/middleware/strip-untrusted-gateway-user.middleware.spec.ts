import type { ConfigService } from '@nestjs/config';
import { createStripUntrustedGatewayUserMiddleware } from './strip-untrusted-gateway-user.middleware';

function configMock(values: Record<string, unknown>): ConfigService {
  return { get: <T>(key: string) => values[key] as T } as unknown as ConfigService;
}

interface ReqLike {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  socket?: { remoteAddress?: string };
}

function run(cfg: ConfigService, req: ReqLike): ReqLike {
  const next = jest.fn();
  createStripUntrustedGatewayUserMiddleware(cfg)(req as unknown as Record<string, unknown>, {}, next);
  expect(next).toHaveBeenCalled();
  return req;
}

describe('strip-untrusted-gateway-user.middleware', () => {
  it('strips x-gateway-user when no trust config is set', () => {
    const r = run(configMock({}), {
      headers: { 'x-gateway-user': 'spoofed', 'x-gateway-internal': 'whatever' },
    });
    expect(r.headers['x-gateway-user']).toBeUndefined();
    expect(r.headers['x-gateway-internal']).toBeUndefined();
  });

  it('keeps x-gateway-user when the matching internal secret is provided', () => {
    const r = run(
      configMock({
        'gateway.trustHeaderName': 'x-gateway-internal',
        'gateway.trustSecret': 's3cret',
        'gateway.trustedIps': [],
      }),
      { headers: { 'x-gateway-user': JSON.stringify({ id: 'u1', email: 'a@b.com' }), 'x-gateway-internal': 's3cret' } },
    );
    expect(r.headers['x-gateway-user']).toBe(JSON.stringify({ id: 'u1', email: 'a@b.com' }));
    expect(r.headers['x-gateway-internal']).toBeUndefined();
    expect((r as ReqLike & { gatewayTrusted?: boolean; user?: unknown }).gatewayTrusted).toBe(true);
    expect((r as ReqLike & { gatewayTrusted?: boolean; user?: unknown }).user).toEqual({
      id: 'u1',
      email: 'a@b.com',
    });
  });

  it('strips x-gateway-user when secret mismatches', () => {
    const r = run(
      configMock({
        'gateway.trustHeaderName': 'x-gateway-internal',
        'gateway.trustSecret': 's3cret',
        'gateway.trustedIps': [],
      }),
      { headers: { 'x-gateway-user': 'spoof', 'x-gateway-internal': 'nope' } },
    );
    expect(r.headers['x-gateway-user']).toBeUndefined();
  });

  it('keeps x-gateway-user when the request comes from a trusted IP', () => {
    const r = run(
      configMock({
        'gateway.trustHeaderName': 'x-gateway-internal',
        'gateway.trustSecret': '',
        'gateway.trustedIps': ['10.0.0.5'],
      }),
      { headers: { 'x-gateway-user': 'real' }, ip: '10.0.0.5' },
    );
    expect(r.headers['x-gateway-user']).toBe('real');
  });

  it('strips x-gateway-user from untrusted IPs', () => {
    const r = run(
      configMock({
        'gateway.trustHeaderName': 'x-gateway-internal',
        'gateway.trustSecret': '',
        'gateway.trustedIps': ['10.0.0.5'],
      }),
      { headers: { 'x-gateway-user': 'spoof' }, ip: '127.0.0.1' },
    );
    expect(r.headers['x-gateway-user']).toBeUndefined();
  });

  it('falls back to socket.remoteAddress when req.ip is missing', () => {
    const r = run(
      configMock({
        'gateway.trustHeaderName': 'x-gateway-internal',
        'gateway.trustSecret': '',
        'gateway.trustedIps': ['10.0.0.5'],
      }),
      { headers: { 'x-gateway-user': 'real' }, socket: { remoteAddress: '10.0.0.5' } },
    );
    expect(r.headers['x-gateway-user']).toBe('real');
  });
});
