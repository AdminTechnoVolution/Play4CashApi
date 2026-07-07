"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisIoAdapter = void 0;
const platform_socket_io_1 = require("@nestjs/platform-socket.io");
const redis_adapter_1 = require("@socket.io/redis-adapter");
const redis_1 = require("redis");
const socket_io_constants_1 = require("../constants/socket-io.constants");
class RedisIoAdapter extends platform_socket_io_1.IoAdapter {
    adapterConstructor = null;
    async connectToRedis(redisUri) {
        const pubClient = (0, redis_1.createClient)({ url: redisUri });
        const subClient = pubClient.duplicate();
        pubClient.on('error', (err) => {
            console.error('[RedisIoAdapter] pub client error', err);
        });
        subClient.on('error', (err) => {
            console.error('[RedisIoAdapter] sub client error', err);
        });
        await Promise.all([pubClient.connect(), subClient.connect()]);
        this.adapterConstructor = (0, redis_adapter_1.createAdapter)(pubClient, subClient);
    }
    createIOServer(port, options) {
        const server = super.createIOServer(port, { ...socket_io_constants_1.SOCKET_IO_PING_OPTIONS, ...options });
        if (this.adapterConstructor) {
            server.adapter(this.adapterConstructor);
        }
        return server;
    }
}
exports.RedisIoAdapter = RedisIoAdapter;
//# sourceMappingURL=redis-io.adapter.js.map