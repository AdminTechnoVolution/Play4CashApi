import mongoose from 'mongoose';
import { AsyncLocalStorage } from 'async_hooks';
import { commandContext, outsideTransaction } from './context';

describe('deferred work isolation', () => {
  it('removes both transaction contexts from delayed work and preserves the caller context', async () => {
    mongoose.set('transactionAsyncLocalStorage', true);
    const storage = (mongoose as unknown as { transactionAsyncLocalStorage: AsyncLocalStorage<unknown> }).transactionAsyncLocalStorage;
    const context = { session: {} as any, roomId: 'room', version: 1, events: [], rejected: false };
    await storage.run({ session: 'request-session' }, () => commandContext.run(context, async () => {
      const delayed = outsideTransaction(() => new Promise<void>(resolve => setTimeout(() => {
        expect(commandContext.getStore()).toBeUndefined();
        expect(storage.getStore()).toBeUndefined();
        resolve();
      }, 1)));
      expect(commandContext.getStore()).toBe(context);
      expect(storage.getStore()).toEqual({ session: 'request-session' });
      await delayed;
    }));
  });
});
