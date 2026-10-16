import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import type { ServerOptions } from 'socket.io';
import { SOCKET_IO_PING_OPTIONS } from '../constants/socket-io.constants';
import { redisDelivery } from './redis-delivery';

/**
 * Enables cross-pod Socket.IO broadcasts when SOCKET_IO_REDIS_ADAPTER=true.
 * Requires REDIS_URI (same instance as session/token Redis).
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;

  async connectToRedis(redisUri: string): Promise<void> {
    const pubClient = createClient({ url: redisUri, disableOfflineQueue: true, commandsQueueMaxLength: 4096 });
    const subClient = pubClient.duplicate();
    const publish = pubClient.publish.bind(pubClient);
    // redis-adapter ignores rejected publish promises. Capture them for the outbox and prevent unhandled rejections elsewhere.
    (pubClient as any).publish = (...args: any[]) => {
      const pending = (publish as any)(...args) as Promise<unknown>;
      redisDelivery.getStore()?.push(pending);
      return pending.catch(() => { console.warn('event=redis_event_publish_pending'); return 0; });
    };
    pubClient.on('error', (err) => {
      console.error('[RedisIoAdapter] pub client error', err);
    });
    subClient.on('error', (err) => {
      console.error('[RedisIoAdapter] sub client error', err);
    });
    await Promise.all([pubClient.connect(), subClient.connect()]);
    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, { ...SOCKET_IO_PING_OPTIONS, ...options });
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
