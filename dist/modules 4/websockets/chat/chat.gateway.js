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
var ChatGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const config_1 = require("@nestjs/config");
const socket_io_1 = require("socket.io");
const mongoose_2 = require("mongoose");
const ws_auth_middleware_1 = require("../../../common/guards/ws-auth.middleware");
const redis_module_1 = require("../../../common/redis/redis.module");
let ChatGateway = ChatGateway_1 = class ChatGateway {
    greetingModel;
    userModel;
    config;
    redis;
    server;
    logger = new common_1.Logger(ChatGateway_1.name);
    constructor(greetingModel, userModel, config, redis) {
        this.greetingModel = greetingModel;
        this.userModel = userModel;
        this.config = config;
        this.redis = redis;
    }
    afterInit(server) {
        (0, ws_auth_middleware_1.applyWsAuth)(server, this.config, this.redis);
    }
    getLang(client) {
        const supported = ['es', 'en', 'fr', 'de', 'it', 'pt'];
        const queryLang = client.handshake?.query?.lang;
        if (queryLang && supported.includes(queryLang.toLowerCase())) {
            return queryLang.toLowerCase();
        }
        if (client.data?.lang && supported.includes(client.data.lang)) {
            return client.data.lang;
        }
        const headerLang = client.handshake.headers['accept-language'];
        if (headerLang && supported.includes(headerLang.toLowerCase())) {
            return headerLang.toLowerCase();
        }
        return 'en';
    }
    handleConnection(client) {
        client.data.lang = this.getLang(client);
        this.logger.log(`[Chat] Connected: ${client.id} | lang=${client.data.lang}`);
    }
    handleDisconnect(client) {
        this.logger.log(`[Chat] Disconnected: ${client.id}`);
    }
    async handleJoin(client, payload) {
        if (!payload?.room_id)
            return client.emit('chat', { success: false, messages: ['Missing room_id'] });
        await client.join(payload.room_id);
        client.data.room_id = payload.room_id;
        client.emit('chat', { success: true, messages: [], data: { joined: true, room_id: payload.room_id } });
    }
    async handleGreeting(client, payload) {
        if (!payload?.room_id || !payload?.greeting_id) {
            return client.emit('chat', { success: false, messages: ['Missing room_id or greeting_id'] });
        }
        const { room_id, greeting_id } = payload;
        const sender_id = client.data.player_id;
        const greeting = await this.greetingModel.findById(greeting_id).lean();
        if (!greeting || !greeting.active) {
            return client.emit('chat', { success: false, messages: ['ws.chat.greetingNotFound'] });
        }
        const senderUser = await this.userModel.findById(sender_id).select('username');
        const senderUsername = senderUser?.username || 'Unknown';
        const sockets = await this.server.in(room_id).fetchSockets();
        for (const s of sockets) {
            const pid = s.data.player_id;
            if (pid === sender_id)
                continue;
            const recipientLang = this.getLang(s);
            const localizedText = greeting.text?.[recipientLang] || greeting.text?.en || '';
            s.emit('chat', {
                success: true,
                data: {
                    type: 'greeting',
                    greeting_id,
                    text: localizedText,
                    from: senderUsername,
                },
                messages: [],
            });
        }
        const senderLang = this.getLang(client);
        client.emit('chat', {
            success: true,
            data: {
                type: 'greeting_sent',
                greeting_id,
                text: greeting.text?.[senderLang] || greeting.text?.en || '',
            },
            messages: [],
        });
    }
};
exports.ChatGateway = ChatGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], ChatGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('join'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], ChatGateway.prototype, "handleJoin", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('greeting'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], ChatGateway.prototype, "handleGreeting", null);
exports.ChatGateway = ChatGateway = ChatGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({ namespace: '/chat', cors: { origin: '*', credentials: true } }),
    __param(0, (0, mongoose_1.InjectModel)('Greeting')),
    __param(1, (0, mongoose_1.InjectModel)('User')),
    __param(3, (0, common_1.Inject)(redis_module_1.REDIS_CLIENT)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model,
        config_1.ConfigService, Object])
], ChatGateway);
//# sourceMappingURL=chat.gateway.js.map