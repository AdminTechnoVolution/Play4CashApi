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
var TurnDeadlineService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TurnDeadlineService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const turn_deadline_schema_1 = require("./turn-deadline.schema");
let TurnDeadlineService = TurnDeadlineService_1 = class TurnDeadlineService {
    model;
    logger = new common_1.Logger(TurnDeadlineService_1.name);
    handlers = new Map();
    constructor(model) {
        this.model = model;
    }
    registerHandler(gameName, handler) {
        this.handlers.set(gameName, handler);
    }
    async schedule(gameName, roomId, playerId, ttlSec) {
        const expiresAt = new Date(Date.now() + Math.max(1, Math.ceil(ttlSec)) * 1000);
        await this.model.findOneAndUpdate({ game_name: gameName, room_id: roomId }, { $set: { player_id: playerId, expires_at: expiresAt, processing: false } }, { upsert: true });
    }
    async cancel(gameName, roomId) {
        await this.model.deleteOne({ game_name: gameName, room_id: roomId });
    }
    async sweep() {
        const now = new Date();
        const due = await this.model
            .find({ expires_at: { $lte: now }, processing: false })
            .sort({ expires_at: 1 })
            .limit(25)
            .exec();
        for (const row of due) {
            const locked = await this.model.findOneAndUpdate({ _id: row._id, processing: false }, { $set: { processing: true } }, { new: true });
            if (!locked)
                continue;
            const handler = this.handlers.get(row.game_name);
            try {
                if (handler)
                    await handler(row.player_id, row.room_id);
            }
            catch (err) {
                this.logger.error(`event=turn_deadline_failed game=${row.game_name} room=${row.room_id}`, err);
            }
            finally {
                await this.model.deleteOne({ _id: row._id });
            }
        }
    }
};
exports.TurnDeadlineService = TurnDeadlineService;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_SECOND),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TurnDeadlineService.prototype, "sweep", null);
exports.TurnDeadlineService = TurnDeadlineService = TurnDeadlineService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(turn_deadline_schema_1.TurnDeadline.name)),
    __metadata("design:paramtypes", [mongoose_2.Model])
], TurnDeadlineService);
//# sourceMappingURL=turn-deadline.service.js.map