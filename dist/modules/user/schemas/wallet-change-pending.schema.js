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
exports.WalletChangePendingSchema = exports.WalletChangePending = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
let WalletChangePending = class WalletChangePending {
    user_id;
    coin;
    network;
    wallet;
    verification_code;
    verification_expires_at;
};
exports.WalletChangePending = WalletChangePending;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User', required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], WalletChangePending.prototype, "user_id", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], WalletChangePending.prototype, "coin", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], WalletChangePending.prototype, "network", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], WalletChangePending.prototype, "wallet", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], WalletChangePending.prototype, "verification_code", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Date)
], WalletChangePending.prototype, "verification_expires_at", void 0);
exports.WalletChangePending = WalletChangePending = __decorate([
    (0, mongoose_1.Schema)({ collection: 'wallet_change_pending', versionKey: false })
], WalletChangePending);
exports.WalletChangePendingSchema = mongoose_1.SchemaFactory.createForClass(WalletChangePending);
exports.WalletChangePendingSchema.index({ user_id: 1 }, { unique: true });
//# sourceMappingURL=wallet-change-pending.schema.js.map