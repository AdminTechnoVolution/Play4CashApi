import { firstValueFrom, of } from 'rxjs';
import { AppVersionStatsInterceptor } from './app-version-stats.interceptor';

function makeStats(sampleRate: number, recordImpl?: () => Promise<void>) {
  return {
    getSampleRate: () => sampleRate,
    record: jest.fn(recordImpl ?? (async () => undefined)),
  };
}

function makeHttpContext(req: Record<string, unknown>) {
  return {
    getType: () => 'http' as const,
    switchToHttp: () => ({ getRequest: <T>() => req as unknown as T }),
  };
}

function makeWsContext() {
  return {
    getType: () => 'ws' as const,
    switchToHttp: () => ({ getRequest: () => undefined }),
  };
}

const passThroughHandler = { handle: () => of('payload') };

describe('AppVersionStatsInterceptor', () => {
  let randomSpy: jest.SpyInstance;
  beforeEach(() => {
    randomSpy = jest.spyOn(Math, 'random');
  });
  afterEach(() => {
    randomSpy.mockRestore();
  });

  it('records the version when Math.random < sampleRate', async () => {
    randomSpy.mockReturnValue(0.05);
    const stats = makeStats(0.1);
    const i = new AppVersionStatsInterceptor(stats as never);
    const ctx = makeHttpContext({ clientAppVersion: '1.2.3' });

    await firstValueFrom(i.intercept(ctx as never, passThroughHandler));

    expect(stats.record).toHaveBeenCalledWith('1.2.3');
  });

  it('skips recording when Math.random >= sampleRate', async () => {
    randomSpy.mockReturnValue(0.95);
    const stats = makeStats(0.1);
    const i = new AppVersionStatsInterceptor(stats as never);
    const ctx = makeHttpContext({ clientAppVersion: '1.2.3' });

    await firstValueFrom(i.intercept(ctx as never, passThroughHandler));

    expect(stats.record).not.toHaveBeenCalled();
  });

  it('skips entirely when sampleRate=0', async () => {
    randomSpy.mockReturnValue(0); // would qualify if rate > 0
    const stats = makeStats(0);
    const i = new AppVersionStatsInterceptor(stats as never);
    const ctx = makeHttpContext({ clientAppVersion: '1.0.0' });

    await firstValueFrom(i.intercept(ctx as never, passThroughHandler));

    expect(stats.record).not.toHaveBeenCalled();
  });

  it('skips when request has no clientAppVersion', async () => {
    randomSpy.mockReturnValue(0);
    const stats = makeStats(1);
    const i = new AppVersionStatsInterceptor(stats as never);
    const ctx = makeHttpContext({});

    await firstValueFrom(i.intercept(ctx as never, passThroughHandler));

    expect(stats.record).not.toHaveBeenCalled();
  });

  it('skips entirely for non-HTTP contexts (e.g. WS)', async () => {
    randomSpy.mockReturnValue(0);
    const stats = makeStats(1);
    const i = new AppVersionStatsInterceptor(stats as never);

    await firstValueFrom(i.intercept(makeWsContext() as never, passThroughHandler));

    expect(stats.record).not.toHaveBeenCalled();
  });

  it('does NOT block the response when record() rejects', async () => {
    randomSpy.mockReturnValue(0);
    const stats = makeStats(1, async () => {
      throw new Error('redis down');
    });
    const i = new AppVersionStatsInterceptor(stats as never);
    const ctx = makeHttpContext({ clientAppVersion: '1.0.0' });

    const result = await firstValueFrom(i.intercept(ctx as never, passThroughHandler));
    expect(result).toBe('payload');
  });
});
