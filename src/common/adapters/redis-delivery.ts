import { AsyncLocalStorage } from 'async_hooks';
/** Capture broker acknowledgements for one outbox publication, without relying on memory for recovery. */
export const redisDelivery = new AsyncLocalStorage<Array<Promise<unknown>>>();
export async function withRedisDelivery<T>(work: () => T): Promise<T> {
  const pending: Array<Promise<unknown>> = [];
  return redisDelivery.run(pending, async () => {
    const result = work();
    await Promise.all(pending);
    return result;
  });
}
