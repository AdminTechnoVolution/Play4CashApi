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
Object.defineProperty(exports, "__esModule", { value: true });
exports.GracePeriodSchema = exports.GracePeriod = void 0;
const mongoose_1 = require("@nestjs/mongoose");
let GracePeriod = class GracePeriod {
    game_name;
    player_id;
    room_id;
    expires_at;
    processing;
};
exports.GracePeriod = GracePeriod;
__decorate([
    (0, mongoose_1.Prop)({ type: String, required: true, index: true }),
    __metadata("design:type", String)
], GracePeriod.prototype, "game_name", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: String, required: true, index: true }),
    __metadata("design:type", String)
], GracePeriod.prototype, "player_id", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: String, required: true }),
    __metadata("design:type", String)
], GracePeriod.prototype, "room_id", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Date, required: true }),
    __metadata("design:type", Date)
], GracePeriod.prototype, "expires_at", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Boolean, default: false }),
    __metadata("design:type", Boolean)
], GracePeriod.prototype, "processing", void 0);
exports.GracePeriod = GracePeriod = __decorate([
    (0, mongoose_1.Schema)({ collection: 'grace_periods', timestamps: { createdAt: 'created_at', updatedAt: false } })
], GracePeriod);
exports.GracePeriodSchema = mongoose_1.SchemaFactory.createForClass(GracePeriod);
exports.GracePeriodSchema.index({ game_name: 1, player_id: 1 }, { unique: true });
exports.GracePeriodSchema.index({ expires_at: 1, processing: 1 });
//# sourceMappingURL=grace-period.schema.js.map