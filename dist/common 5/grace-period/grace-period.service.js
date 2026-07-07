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
var GracePeriodService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GracePeriodService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const grace_period_schema_1 = require("./grace-period.schema");
let GracePeriodService = class GracePeriodService {
    static { GracePeriodService_1 = this; }
    graceModel;
    logger = new common_1.Logger(GracePeriodService_1.name);
    handlers = new Map();
    static MIN_GRACE_SECS = 30;
    constructor(graceModel) {
        this.graceModel = graceModel;
    }
    registerHandler(gameName, handler) {
        this.handlers.set(gameName, handler);
    }
    async start(gameName, playerId, roomId, ttlSec) {
        const clampedTtl = Math.max(GracePeriodService_1.MIN_GRACE_SECS, Math.ceil(ttlSec));
        const expiresAt = new Date(Date.now() + clampedTtl * 1000);
        try {
            await this.graceModel.findOneAndUpdate({ game_name: gameName, player_id: playerId }, {
                $set: {
                    room_id: roomId,
                    expires_at: expiresAt,
                    processing: false,
                },
            }, { upsert: true });
            this.logger.log(`event=grace_started game=${gameName} player=${playerId} room=${roomId} ttl=${clampedTtl}s`);
        }
        catch (err) {
            this.logger.error(`[Grace] start failed | game=${gameName} player=${playerId}`, err);
        }
    }
    async cancel(gameName, playerId) {
        try {
            const result = await this.graceModel.deleteOne({ game_name: gameName, player_id: playerId });
            if (result?.deletedCount && result.deletedCount > 0) {
                this.logger.log(`event=grace_cancelled game=${gameName} player=${playerId}`);
            }
        }
        catch (err) {
            this.logger.error(`[Grace] cancel failed | game=${gameName} player=${playerId}`, err);
        }
    }
    async sweep() {
        const BATCH_LIMIT = 25;
        for (let i = 0; i < BATCH_LIMIT; i++) {
            let next = null;
            try {
                next = await this.graceModel.findOneAndUpdate({ expires_at: { $lte: new Date() }, processing: false }, { $set: { processing: true } }, { returnDocument: 'after' });
            }
            catch (err) {
                this.logger.error('[Grace] sweep poll failed', err);
                return;
            }
            if (!next)
                return;
            const handler = this.handlers.get(next.game_name);
            if (!handler) {
                await this.graceModel
                    .updateOne({ _id: next._id }, { $set: { processing: false } })
                    .catch(() => { });
                this.logger.warn(`[Grace] no handler registered for game=${next.game_name} — released lock`);
                return;
            }
            try {
                this.logger.log(`event=grace_expired game=${next.game_name} player=${next.player_id} room=${next.room_id}`);
                await handler(next.player_id, next.room_id);
            }
            catch (err) {
                this.logger.error(`[Grace] handler failed | game=${next.game_name} player=${next.player_id}`, err);
            }
            await this.graceModel.deleteOne({ _id: next._id }).catch(() => { });
        }
    }
};
exports.GracePeriodService = GracePeriodService;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_SECOND),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], GracePeriodService.prototype, "sweep", null);
exports.GracePeriodService = GracePeriodService = GracePeriodService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(grace_period_schema_1.GracePeriod.name)),
    __metadata("design:paramtypes", [mongoose_2.Model])
], GracePeriodService);
//# sourceMappingURL=grace-period.service.js.map