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
exports.RechargeSchema = exports.Recharge = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
let Recharge = class Recharge {
    user_id;
    txId;
    amount;
    network;
    wallet;
    coin;
    status;
    created_at;
    confirmed_at;
    time_processing_expires_at;
};
exports.Recharge = Recharge;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User', required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], Recharge.prototype, "user_id", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Recharge.prototype, "txId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Number)
], Recharge.prototype, "amount", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Recharge.prototype, "network", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Recharge.prototype, "wallet", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, uppercase: true }),
    __metadata("design:type", String)
], Recharge.prototype, "coin", void 0);
__decorate([
    (0, mongoose_1.Prop)({
        type: String,
        enum: ['processing', 'confirmed'],
        default: 'processing',
        lowercase: true,
    }),
    __metadata("design:type", String)
], Recharge.prototype, "status", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: Date.now }),
    __metadata("design:type", Date)
], Recharge.prototype, "created_at", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], Recharge.prototype, "confirmed_at", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], Recharge.prototype, "time_processing_expires_at", void 0);
exports.Recharge = Recharge = __decorate([
    (0, mongoose_1.Schema)({ versionKey: false, timestamps: false })
], Recharge);
exports.RechargeSchema = mongoose_1.SchemaFactory.createForClass(Recharge);
exports.RechargeSchema.index({ time_processing_expires_at: 1 }, { expireAfterSeconds: 0 });
exports.RechargeSchema.index({ txId: 1 }, { unique: true });
exports.RechargeSchema.index({ user_id: 1 });
exports.RechargeSchema.index({ coin: 1 });
exports.RechargeSchema.index({ status: 1 });
//# sourceMappingURL=recharge.schema.js.map