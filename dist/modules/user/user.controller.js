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
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserController = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const throttler_1 = require("@nestjs/throttler");
const swagger_1 = require("@nestjs/swagger");
const user_service_1 = require("./user.service");
const admin_guard_1 = require("../../common/guards/admin.guard");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const i18n_service_1 = require("../../common/i18n/i18n.service");
const public_decorator_1 = require("../../common/decorators/public.decorator");
const class_validator_1 = require("class-validator");
const swagger_2 = require("@nestjs/swagger");
class RegisterWalletDto {
    coin;
    network;
    wallet;
}
__decorate([
    (0, swagger_2.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RegisterWalletDto.prototype, "coin", void 0);
__decorate([
    (0, swagger_2.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RegisterWalletDto.prototype, "network", void 0);
__decorate([
    (0, swagger_2.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RegisterWalletDto.prototype, "wallet", void 0);
class UpdateProfileDto {
    username;
}
__decorate([
    (0, swagger_2.ApiProperty)({ required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(20),
    __metadata("design:type", String)
], UpdateProfileDto.prototype, "username", void 0);
class RegisterUserDto {
    email;
    username;
    referred_by;
}
__decorate([
    (0, swagger_2.ApiProperty)(),
    (0, class_validator_1.IsEmail)(),
    __metadata("design:type", String)
], RegisterUserDto.prototype, "email", void 0);
__decorate([
    (0, swagger_2.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(20),
    __metadata("design:type", String)
], RegisterUserDto.prototype, "username", void 0);
__decorate([
    (0, swagger_2.ApiProperty)({ required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RegisterUserDto.prototype, "referred_by", void 0);
class VerifyCodeDto {
    email;
    verification_code;
}
__decorate([
    (0, swagger_2.ApiProperty)(),
    (0, class_validator_1.IsEmail)(),
    __metadata("design:type", String)
], VerifyCodeDto.prototype, "email", void 0);
__decorate([
    (0, swagger_2.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], VerifyCodeDto.prototype, "verification_code", void 0);
class ConfirmWalletOtpDto {
    verification_code;
}
__decorate([
    (0, swagger_2.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(4),
    (0, class_validator_1.MaxLength)(12),
    __metadata("design:type", String)
], ConfirmWalletOtpDto.prototype, "verification_code", void 0);
class PushSubscriptionDto {
    endpoint;
    p256dh;
    auth;
}
__decorate([
    (0, swagger_2.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PushSubscriptionDto.prototype, "endpoint", void 0);
__decorate([
    (0, swagger_2.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PushSubscriptionDto.prototype, "p256dh", void 0);
__decorate([
    (0, swagger_2.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], PushSubscriptionDto.prototype, "auth", void 0);
class RemovePushSubscriptionDto {
    endpoint;
}
__decorate([
    (0, swagger_2.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], RemovePushSubscriptionDto.prototype, "endpoint", void 0);
let UserController = class UserController {
    userService;
    i18n;
    config;
    constructor(userService, i18n, config) {
        this.userService = userService;
        this.i18n = i18n;
        this.config = config;
    }
    getTotalBalances() {
        return this.userService.getTotalBalances();
    }
    getPublicStats() {
        return this.userService.getPublicUserStats();
    }
    getAccount(user) {
        return this.userService.getProfile(user.id);
    }
    getHistory(user, lang) {
        return this.userService.getHistory(user.id, lang || 'en');
    }
    register(dto) {
        return this.userService.registerUser(dto.email, dto.username, dto.referred_by);
    }
    async requestWalletChange(user, dto, lang) {
        const expiryMins = this.config.get('withdrawal.verificationExpiryMinutes') || 30;
        await this.userService.requestWalletChange(user.id, dto.coin, dto.network, dto.wallet, expiryMins, lang || 'en');
        const message = this.i18n.translate('SUCCESS_WALLET_CHANGE_OTP_SENT', lang);
        return { success: true, messages: [message], data: null };
    }
    async confirmWalletChange(user, dto, lang) {
        await this.userService.confirmWalletChangeWithOtp(user.id, dto.verification_code);
        const message = this.i18n.translate('SUCCESS_WALLET_CHANGE_CONFIRMED', lang);
        return { success: true, messages: [message], data: null };
    }
    verifyCode(dto) {
        return this.userService.verifyCode(dto.email, dto.verification_code);
    }
    updateProfile(user, dto) {
        return this.userService.updateProfile(user.id, dto);
    }
    async savePushSubscription(user, dto) {
        await this.userService.savePushSubscription(user.id, {
            endpoint: dto.endpoint,
            keys: { p256dh: dto.p256dh, auth: dto.auth },
        });
        return { success: true, messages: [], data: { saved: true } };
    }
    async removePushSubscription(user, dto) {
        await this.userService.removePushSubscription(user.id, dto.endpoint);
        return { success: true, messages: [], data: { removed: true } };
    }
};
exports.UserController = UserController;
__decorate([
    (0, common_1.Get)('admin/total-balances'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Admin: get total platform balances' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], UserController.prototype, "getTotalBalances", null);
__decorate([
    (0, throttler_1.Throttle)({ default: { limit: 120, ttl: 60_000 } }),
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('public/stats'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Public: registered user count (rate-limited)' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], UserController.prototype, "getPublicStats", null);
__decorate([
    (0, common_1.Get)('account'),
    (0, swagger_1.ApiOperation)({ summary: 'Get authenticated user account' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], UserController.prototype, "getAccount", null);
__decorate([
    (0, common_1.Get)('history'),
    (0, swagger_1.ApiOperation)({ summary: 'Get authenticated user game history' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Headers)('accept-language')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], UserController.prototype, "getHistory", null);
__decorate([
    (0, throttler_1.Throttle)({ default: { limit: 20, ttl: 900_000 } }),
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('register'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Register a new user account' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [RegisterUserDto]),
    __metadata("design:returntype", void 0)
], UserController.prototype, "register", null);
__decorate([
    (0, throttler_1.Throttle)({ default: { limit: 15, ttl: 900_000 } }),
    (0, common_1.Post)('request-wallet-change'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Request wallet update (sends OTP to email)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Headers)('accept-language')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, RegisterWalletDto, String]),
    __metadata("design:returntype", Promise)
], UserController.prototype, "requestWalletChange", null);
__decorate([
    (0, common_1.Post)('confirm-wallet-change'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Confirm wallet update with email verification code' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Headers)('accept-language')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, ConfirmWalletOtpDto, String]),
    __metadata("design:returntype", Promise)
], UserController.prototype, "confirmWalletChange", null);
__decorate([
    (0, throttler_1.Throttle)({ default: { limit: 30, ttl: 900_000 } }),
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('verify-code'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Verify email code to activate account' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [VerifyCodeDto]),
    __metadata("design:returntype", void 0)
], UserController.prototype, "verifyCode", null);
__decorate([
    (0, common_1.Put)('profile'),
    (0, swagger_1.ApiOperation)({ summary: 'Update user profile' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, UpdateProfileDto]),
    __metadata("design:returntype", void 0)
], UserController.prototype, "updateProfile", null);
__decorate([
    (0, common_1.Post)('push-subscription'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Register Web Push subscription for background alerts' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, PushSubscriptionDto]),
    __metadata("design:returntype", Promise)
], UserController.prototype, "savePushSubscription", null);
__decorate([
    (0, common_1.Post)('push-subscription/remove'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Remove Web Push subscription' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, RemovePushSubscriptionDto]),
    __metadata("design:returntype", Promise)
], UserController.prototype, "removePushSubscription", null);
exports.UserController = UserController = __decorate([
    (0, swagger_1.ApiTags)('User'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('user'),
    __metadata("design:paramtypes", [user_service_1.UserService,
        i18n_service_1.I18nService,
        config_1.ConfigService])
], UserController);
//# sourceMappingURL=user.controller.js.map