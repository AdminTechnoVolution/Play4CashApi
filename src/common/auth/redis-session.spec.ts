import { redisSessionExists } from './redis-session';
describe('bounded session checks', () => {
  afterEach(() => jest.useRealTimers());
  it('fails closed immediately when the client is offline', async () => {
    const exists = jest.fn();
    expect(await redisSessionExists({ isReady: false, exists }, 'test-only-session')).toBe(false);
    expect(exists).not.toHaveBeenCalled();
  });
  it('returns without authorizing when Redis stops answering', async () => {
    jest.useFakeTimers();
    const result = redisSessionExists({ exists: () => new Promise<number>(() => {}) }, 'test-only-session');
    await jest.advanceTimersByTimeAsync(2000);
    expect(await result).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });
});
