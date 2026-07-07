import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions } from 'socket.io';
export declare class RedisIoAdapter extends IoAdapter {
    private adapterConstructor;
    connectToRedis(redisUri: string): Promise<void>;
    createIOServer(port: number, options?: ServerOptions): any;
}
