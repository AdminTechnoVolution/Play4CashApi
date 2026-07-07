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
var TournamentsGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TournamentsGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const config_1 = require("@nestjs/config");
const socket_io_1 = require("socket.io");
const mongoose_2 = require("mongoose");
const ws_auth_middleware_1 = require("../../../common/guards/ws-auth.middleware");
const redis_module_1 = require("../../../common/redis/redis.module");
const tournament_schema_1 = require("../../tournament/schemas/tournament.schema");
const tournament_state_service_1 = require("../../tournament/services/tournament-state.service");
const tournament_presence_service_1 = require("../../tournament/services/tournament-presence.service");
const tournament_language_util_1 = require("../../tournament/tournament-language.util");
const EVENT = 'tournament';
let TournamentsGateway = TournamentsGateway_1 = class TournamentsGateway {
    tournamentModel;
    stateService;
    presenceService;
    config;
    redis;
    server;
    logger = new common_1.Logger(TournamentsGateway_1.name);
    constructor(tournamentModel, stateService, presenceService, config, redis) {
        this.tournamentModel = tournamentModel;
        this.stateService = stateService;
        this.presenceService = presenceService;
        this.config = config;
        this.redis = redis;
    }
    afterInit(server) {
        (0, ws_auth_middleware_1.applyWsAuth)(server, this.config, this.redis);
    }
    handleConnection(client) {
        this.logger.log(`[Tournaments] Connected: ${client.id}`);
    }
    handleDisconnect(client) {
        const tid = client.data.tournament_id;
        const uid = client.data.player_id;
        if (tid && uid)
            void this.presenceService.clear(tid, uid);
        this.logger.log(`[Tournaments] Disconnected: ${client.id}`);
    }
    roomId(tournamentId) {
        return `tournament:${tournamentId}`;
    }
    async emitState(tournamentId) {
        const t = await this.tournamentModel.findById(tournamentId);
        if (!t)
            return;
        const room = this.roomId(tournamentId);
        const sockets = await this.server.in(room).fetchSockets();
        await Promise.all(sockets.map(async (remote) => {
            const lang = (0, tournament_language_util_1.resolveWsLang)(remote);
            const uid = remote.data.player_id;
            const data = await this.stateService.toPublicDetail(t, uid, lang);
            remote.emit(EVENT, {
                success: true,
                event: 'tournament:state',
                data,
                messages: [],
            });
        }));
    }
    async emitBracketUpdated(tournamentId) {
        const bracket = await this.stateService.getBracket(tournamentId);
        const room = this.roomId(tournamentId);
        this.server.to(room).emit(EVENT, {
            success: true,
            event: 'tournament:bracketUpdated',
            data: { tournamentId, bracket },
            messages: [],
        });
    }
    async emitMatchUpdate(tournamentId) {
        await this.emitState(tournamentId);
        await this.emitBracketUpdated(tournamentId);
    }
    async handleJoin(client, payload) {
        const tournamentId = payload?.tournament_id;
        if (!tournamentId) {
            return client.emit(EVENT, { success: false, event: 'tournament:error', messages: ['Missing tournament_id'] });
        }
        await client.join(this.roomId(tournamentId));
        client.data.tournament_id = tournamentId;
        client.data.lang = (0, tournament_language_util_1.resolveWsLang)(client);
        const uid = client.data.player_id;
        if (uid)
            await this.presenceService.markPresent(tournamentId, uid);
        const t = await this.tournamentModel.findById(tournamentId);
        if (!t) {
            return client.emit(EVENT, { success: false, event: 'tournament:error', messages: ['Not found'] });
        }
        const data = await this.stateService.toPublicDetail(t, uid, client.data.lang);
        client.emit(EVENT, { success: true, event: 'tournament:state', data, messages: [] });
    }
    async handleLeave(client) {
        const tid = client.data.tournament_id;
        const uid = client.data.player_id;
        if (tid)
            await client.leave(this.roomId(tid));
        if (tid && uid)
            await this.presenceService.clear(tid, uid);
        client.data.tournament_id = undefined;
        client.emit(EVENT, { success: true, event: 'tournament:left', data: {}, messages: [] });
    }
    async handleGetState(client) {
        const tid = client.data.tournament_id;
        if (!tid) {
            return client.emit(EVENT, { success: false, event: 'tournament:error', messages: ['Not joined'] });
        }
        const t = await this.tournamentModel.findById(tid);
        if (!t)
            return;
        const lang = client.data.lang ?? (0, tournament_language_util_1.resolveWsLang)(client);
        const data = await this.stateService.toPublicDetail(t, client.data.player_id, lang);
        client.emit(EVENT, { success: true, event: 'tournament:state', data, messages: [] });
    }
    async handleHeartbeat(client) {
        const tid = client.data.tournament_id;
        const uid = client.data.player_id;
        if (tid && uid)
            await this.presenceService.markPresent(tid, uid);
    }
};
exports.TournamentsGateway = TournamentsGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], TournamentsGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('tournament:join'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], TournamentsGateway.prototype, "handleJoin", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('tournament:leave'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket]),
    __metadata("design:returntype", Promise)
], TournamentsGateway.prototype, "handleLeave", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('tournament:getState'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket]),
    __metadata("design:returntype", Promise)
], TournamentsGateway.prototype, "handleGetState", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('tournament:heartbeat'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket]),
    __metadata("design:returntype", Promise)
], TournamentsGateway.prototype, "handleHeartbeat", null);
exports.TournamentsGateway = TournamentsGateway = TournamentsGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({ namespace: '/tournaments', cors: { origin: '*', credentials: true } }),
    __param(0, (0, mongoose_1.InjectModel)(tournament_schema_1.Tournament.name)),
    __param(4, (0, common_1.Inject)(redis_module_1.REDIS_CLIENT)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        tournament_state_service_1.TournamentStateService,
        tournament_presence_service_1.TournamentPresenceService,
        config_1.ConfigService, Object])
], TournamentsGateway);
//# sourceMappingURL=tournaments.gateway.js.map