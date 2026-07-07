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
exports.WithdrawalSchema = exports.Withdrawal = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
let Withdrawal = class Withdrawal {
    user_id;
    amount;
    coin;
    wallet;
    id_binance;
    tx_fee;
    transfer_type;
    wallet_type;
    txId;
    network;
    status;
    created_at;
    confirmed_at;
    confirmed_at_binance;
    verification_code;
    verification_expires_at;
};
exports.Withdrawal = Withdrawal;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User', required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], Withdrawal.prototype, "user_id", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Number)
], Withdrawal.prototype, "amount", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, uppercase: true }),
    __metadata("design:type", String)
], Withdrawal.prototype, "coin", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Withdrawal.prototype, "wallet", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Withdrawal.prototype, "id_binance", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], Withdrawal.prototype, "tx_fee", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: String, enum: ['internal', 'external', 'unknown'] }),
    __metadata("design:type", String)
], Withdrawal.prototype, "transfer_type", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: String, enum: ['spot', 'funding', 'unknown'] }),
    __metadata("design:type", String)
], Withdrawal.prototype, "wallet_type", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Withdrawal.prototype, "txId", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Withdrawal.prototype, "network", void 0);
__decorate([
    (0, mongoose_1.Prop)({
        type: String,
        enum: ['pending_verify', 'processing', 'confirmed', 'failed'],
        default: 'pending_verify',
        lowercase: true,
    }),
    __metadata("design:type", String)
], Withdrawal.prototype, "status", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: Date.now }),
    __metadata("design:type", Date)
], Withdrawal.prototype, "created_at", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], Withdrawal.prototype, "confirmed_at", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], Withdrawal.prototype, "confirmed_at_binance", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Withdrawal.prototype, "verification_code", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], Withdrawal.prototype, "verification_expires_at", void 0);
exports.Withdrawal = Withdrawal = __decorate([
    (0, mongoose_1.Schema)({ versionKey: false, timestamps: false })
], Withdrawal);
exports.WithdrawalSchema = mongoose_1.SchemaFactory.createForClass(Withdrawal);
exports.WithdrawalSchema.index({ verification_expires_at: 1 }, { expireAfterSeconds: 0 });
exports.WithdrawalSchema.index({ wallet_type: 1 });
exports.WithdrawalSchema.index({ transfer_type: 1 });
exports.WithdrawalSchema.index({ wallet: 1 });
exports.WithdrawalSchema.index({ user_id: 1 });
exports.WithdrawalSchema.index({ coin: 1 });
exports.WithdrawalSchema.index({ status: 1 });
//# sourceMappingURL=withdrawal.schema.js.map