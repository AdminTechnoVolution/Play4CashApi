import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import type { ServerOptions } from 'socket.io';
import { SOCKET_IO_PING_OPTIONS } from '../constants/socket-io.constants';

/**
 * Enables cross-pod Socket.IO broadcasts when SOCKET_IO_REDIS_ADAPTER=true.
 * Requires REDIS_URI (same instance as session/token Redis).
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor: ReturnType<typeof createAdapter> | null = null;

  async connectToRedis(redisUri: string): Promise<void> {
    const pubClient = createClient({ url: redisUri });
    const subClient = pubClient.duplicate();
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
