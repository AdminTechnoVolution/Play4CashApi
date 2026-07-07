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
var RoomsGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoomsGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const socket_io_1 = require("socket.io");
const ws_auth_middleware_1 = require("../../../common/guards/ws-auth.middleware");
const redis_module_1 = require("../../../common/redis/redis.module");
let RoomsGateway = RoomsGateway_1 = class RoomsGateway {
    config;
    redis;
    server;
    logger = new common_1.Logger(RoomsGateway_1.name);
    constructor(config, redis) {
        this.config = config;
        this.redis = redis;
    }
    afterInit(server) { (0, ws_auth_middleware_1.applyWsAuth)(server, this.config, this.redis); }
    handleConnection(client) { this.logger.log(`[Rooms] Connected: ${client.id}`); }
    handleDisconnect(client) { this.logger.log(`[Rooms] Disconnected: ${client.id}`); }
    async handleSubscribe(client, payload) {
        if (!payload?.game_id) {
            client.emit('rooms', { success: false, messages: ['Missing game_id'] });
            return;
        }
        await client.join(`game:${payload.game_id}`);
        client.emit('rooms', { success: true, messages: [], data: { event: 'subscribed', game_id: payload.game_id } });
    }
    async handleUnsubscribe(client, payload) {
        if (!payload?.game_id)
            return;
        await client.leave(`game:${payload.game_id}`);
        client.emit('rooms', { success: true, messages: [], data: { event: 'unsubscribed', game_id: payload.game_id } });
    }
    broadcastRoomUpdate(gameId, event, data) {
        this.server.to(`game:${gameId}`).emit(event, data);
    }
};
exports.RoomsGateway = RoomsGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], RoomsGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('subscribe'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], RoomsGateway.prototype, "handleSubscribe", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('unsubscribe'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], RoomsGateway.prototype, "handleUnsubscribe", null);
exports.RoomsGateway = RoomsGateway = RoomsGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({ namespace: '/rooms', cors: { origin: '*', credentials: true } }),
    __param(1, (0, common_1.Inject)(redis_module_1.REDIS_CLIENT)),
    __metadata("design:paramtypes", [config_1.ConfigService, Object])
], RoomsGateway);
//# sourceMappingURL=rooms.gateway.js.map