import { AdminHealthService } from './admin-health.service';

describe('AdminHealthService', () => {
  const config = { get: jest.fn().mockReturnValue(true) };

  it('reports healthy dependencies with measured data', async () => {
    const service = new AdminHealthService(
      { db: { admin: () => ({ ping: jest.fn().mockResolvedValue({ ok: 1 }) }) } } as any,
      { ping: jest.fn().mockResolvedValue('PONG') },
      { server: { fetchSockets: jest.fn().mockResolvedValue([{}, {}]) } } as any,
      config as any,
    );

    const result = await service.check();

    expect(result.status).toBe('healthy');
    expect(result.services.mongodb.status).toBe('healthy');
    expect(result.services.redis.status).toBe('healthy');
    expect(result.services.websocket).toMatchObject({
      status: 'healthy',
      initialized: true,
      redis_adapter_enabled: true,
      connected_clients: 2,
    });
  });

  it('reports individual failures without preventing other checks', async () => {
    const service = new AdminHealthService(
      { db: { admin: () => ({ ping: jest.fn().mockRejectedValue(new Error('secret mongo uri')) }) } } as any,
      { ping: jest.fn().mockResolvedValue('PONG') },
      { server: undefined } as any,
      config as any,
    );

    const result = await service.check();

    expect(result.status).toBe('degraded');
    expect(result.services.mongodb).toMatchObject({
      status: 'unavailable',
      error_code: 'MONGODB_UNAVAILABLE',
    });
    expect(result.services.redis.status).toBe('healthy');
    expect(result.services.websocket).toMatchObject({
      status: 'unavailable',
      error_code: 'WEBSOCKET_NOT_INITIALIZED',
    });
    expect(JSON.stringify(result)).not.toContain('secret mongo uri');
  });

  it('turns a dependency timeout into a sanitized degraded state', async () => {
    jest.useFakeTimers();
    const service = new AdminHealthService(
      { db: { admin: () => ({ ping: jest.fn(() => new Promise(() => undefined)) }) } } as any,
      { ping: jest.fn().mockResolvedValue('PONG') },
      { server: { fetchSockets: jest.fn().mockResolvedValue([]) } } as any,
      config as any,
    );

    const pending = service.check();
    await jest.advanceTimersByTimeAsync(2_000);
    const result = await pending;

    expect(result.status).toBe('degraded');
    expect(result.services.mongodb).toMatchObject({
      status: 'degraded',
      error_code: 'MONGODB_TIMEOUT',
    });
    jest.useRealTimers();
  });
});
