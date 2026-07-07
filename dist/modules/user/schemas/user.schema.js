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
exports.UserSchema = exports.User = exports.WalletAddress = exports.UserRole = exports.UserStatus = void 0;
const mongoose_1 = require("@nestjs/mongoose");
var UserStatus;
(function (UserStatus) {
    UserStatus["PENDING_VERIFY"] = "pending_verify";
    UserStatus["ACTIVE"] = "active";
    UserStatus["INACTIVE"] = "inactive";
})(UserStatus || (exports.UserStatus = UserStatus = {}));
var UserRole;
(function (UserRole) {
    UserRole["USER"] = "user";
    UserRole["ADMIN"] = "admin";
})(UserRole || (exports.UserRole = UserRole = {}));
let WalletAddress = class WalletAddress {
    coin;
    network;
    wallet;
};
exports.WalletAddress = WalletAddress;
__decorate([
    (0, mongoose_1.Prop)({ uppercase: true }),
    __metadata("design:type", String)
], WalletAddress.prototype, "coin", void 0);
__decorate([
    (0, mongoose_1.Prop)({ uppercase: true, maxlength: 50 }),
    __metadata("design:type", String)
], WalletAddress.prototype, "network", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], WalletAddress.prototype, "wallet", void 0);
exports.WalletAddress = WalletAddress = __decorate([
    (0, mongoose_1.Schema)({ versionKey: false })
], WalletAddress);
let User = class User {
    email;
    username;
    wallet_address;
    balance;
    total_recharged;
    total_witdrawal;
    total_won;
    created_at;
    status;
    role;
    push_subscriptions;
};
exports.User = User;
__decorate([
    (0, mongoose_1.Prop)({ required: true, unique: true }),
    __metadata("design:type", String)
], User.prototype, "email", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, maxlength: 20 }),
    __metadata("design:type", String)
], User.prototype, "username", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: WalletAddress, _id: false }),
    __metadata("design:type", WalletAddress)
], User.prototype, "wallet_address", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], User.prototype, "balance", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], User.prototype, "total_recharged", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], User.prototype, "total_witdrawal", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0 }),
    __metadata("design:type", Number)
], User.prototype, "total_won", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: Date.now }),
    __metadata("design:type", Date)
], User.prototype, "created_at", void 0);
__decorate([
    (0, mongoose_1.Prop)({
        type: String,
        enum: Object.values(UserStatus),
        default: UserStatus.ACTIVE,
        lowercase: true,
    }),
    __metadata("design:type", String)
], User.prototype, "status", void 0);
__decorate([
    (0, mongoose_1.Prop)({
        type: String,
        enum: Object.values(UserRole),
        default: UserRole.USER,
        lowercase: true,
    }),
    __metadata("design:type", String)
], User.prototype, "role", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [{ endpoint: String, keys: { p256dh: String, auth: String } }], default: [] }),
    __metadata("design:type", Array)
], User.prototype, "push_subscriptions", void 0);
exports.User = User = __decorate([
    (0, mongoose_1.Schema)({ versionKey: false })
], User);
exports.UserSchema = mongoose_1.SchemaFactory.createForClass(User);
exports.UserSchema.index({ username: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
exports.UserSchema.index({ status: 1 });
//# sourceMappingURL=user.schema.js.map