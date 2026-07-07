"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var RpsGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RpsGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const socket_io_1 = require("socket.io");
const ws_auth_middleware_1 = require("../../../common/guards/ws-auth.middleware");
const redis_module_1 = require("../../../common/redis/redis.module");
let RpsGateway = RpsGateway_1 = class RpsGateway {
    config;
    redis;
    server;
    logger = new common_1.Logger(RpsGateway_1.name);
    queue = new Map();
    constructor(config, redis) {
        this.config = config;
        this.redis = redis;
    }
    afterInit(server) { (0, ws_auth_middleware_1.applyWsAuth)(server, this.config, this.redis); }
    handleConnection(client) { this.logger.log(`[RPS] Connected: ${client.id}`); }
    handleDisconnect(client) {
        this.queue.delete(client.id);
        this.logger.log(`[RPS] Disconnected: ${client.id}`);
    }
    async handleJoin(client, payload) {
        if (!payload?.game_id) {
            client.emit('rps', { success: false, messages: ['Missing game_id'] });
            return;
        }
        const matchKey = `${payload.game_id}:${payload.bet_amount}`;
        this.queue.set(matchKey, client);
        const waitingEntries = [...this.queue.entries()].filter(([k]) => k.startsWith(matchKey));
        if (waitingEntries.length >= 2) {
            const [key1, player1] = waitingEntries[0];
            const [key2, player2] = waitingEntries[1];
            this.queue.delete(key1);
            this.queue.delete(key2);
            const roomId = `rps:${Date.now()}`;
            await player1.join(roomId);
            await player2.join(roomId);
            this.server.to(roomId).emit('rps', {
                success: true, messages: [],
                data: { event: 'match_found', room_id: roomId },
            });
        }
        else {
            client.emit('rps', { success: true, messages: [], data: { event: 'queued' } });
        }
    }
};
exports.RpsGateway = RpsGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], RpsGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('join'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], RpsGateway.prototype, "handleJoin", null);
exports.RpsGateway = RpsGateway = RpsGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({ namespace: '/rps', cors: { origin: '*', credentials: true } }),
    __param(1, (0, common_1.Inject)(redis_module_1.REDIS_CLIENT)),
    __metadata("design:paramtypes", [config_1.ConfigService, Object])
], RpsGateway);
//# sourceMappingURL=rps.gateway.js.map