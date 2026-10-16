import { redisDelivery, withRedisDelivery } from './redis-delivery';
describe('outbox broker acknowledgement', () => {
  it('does not finish publishing before Redis accepts the event', async () => {
    let accept!: () => void;
    const broker = new Promise<void>(resolve => { accept = resolve; });
    let completed = false;
    const delivery = withRedisDelivery(() => { redisDelivery.getStore()!.push(broker); return true; }).then(() => { completed = true; });
    await Promise.resolve();
    expect(completed).toBe(false);
    accept(); await delivery;
    expect(completed).toBe(true);
  });
  it('fails publication when Redis rejects so the persistent outbox can retry', async () => {
    await expect(withRedisDelivery(() => {
      redisDelivery.getStore()!.push(Promise.reject(new Error('Redis unavailable')));
      return true;
    })).rejects.toThrow('Redis unavailable');
  });
});
