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
var TournamentPresenceService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TournamentPresenceService = void 0;
const common_1 = require("@nestjs/common");
const common_2 = require("@nestjs/common");
const redis_module_1 = require("../../../common/redis/redis.module");
const PRESENCE_TTL_SEC = 45;
let TournamentPresenceService = TournamentPresenceService_1 = class TournamentPresenceService {
    redis;
    logger = new common_1.Logger(TournamentPresenceService_1.name);
    constructor(redis) {
        this.redis = redis;
    }
    key(tournamentId, userId) {
        return `tournament:presence:${tournamentId}:${userId}`;
    }
    async markPresent(tournamentId, userId) {
        try {
            await this.redis.set(this.key(tournamentId, userId), '1', 'EX', PRESENCE_TTL_SEC);
        }
        catch (e) {
            this.logger.warn(`event=tournament_presence_set_failed err=${e.message}`);
        }
    }
    async isPresent(tournamentId, userId) {
        try {
            const v = await this.redis.get(this.key(tournamentId, userId));
            return v === '1';
        }
        catch {
            return false;
        }
    }
    async clear(tournamentId, userId) {
        try {
            await this.redis.del(this.key(tournamentId, userId));
        }
        catch {
        }
    }
};
exports.TournamentPresenceService = TournamentPresenceService;
exports.TournamentPresenceService = TournamentPresenceService = TournamentPresenceService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_2.Inject)(redis_module_1.REDIS_CLIENT)),
    __metadata("design:paramtypes", [Object])
], TournamentPresenceService);
//# sourceMappingURL=tournament-presence.service.js.map