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
exports.WalletSchema = exports.WalletEntry = void 0;
const mongoose_1 = require("@nestjs/mongoose");
let WalletEntry = class WalletEntry {
    coin;
    address;
    red;
    description;
    minAmount;
    networkWithdrawalFee;
    isActive;
};
exports.WalletEntry = WalletEntry;
__decorate([
    (0, mongoose_1.Prop)({ required: true, uppercase: true }),
    __metadata("design:type", String)
], WalletEntry.prototype, "coin", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], WalletEntry.prototype, "address", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], WalletEntry.prototype, "red", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], WalletEntry.prototype, "description", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, default: 0 }),
    __metadata("design:type", Number)
], WalletEntry.prototype, "minAmount", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, default: 0 }),
    __metadata("design:type", Number)
], WalletEntry.prototype, "networkWithdrawalFee", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: true }),
    __metadata("design:type", Boolean)
], WalletEntry.prototype, "isActive", void 0);
exports.WalletEntry = WalletEntry = __decorate([
    (0, mongoose_1.Schema)({ versionKey: false, timestamps: false, collection: 'wallets' })
], WalletEntry);
exports.WalletSchema = mongoose_1.SchemaFactory.createForClass(WalletEntry);
exports.WalletSchema.index({ coin: 1 });
exports.WalletSchema.index({ isActive: 1 });
//# sourceMappingURL=wallet.schema.js.map