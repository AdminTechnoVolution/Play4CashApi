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
exports.WithdrawalController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const withdrawal_service_1 = require("./withdrawal.service");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const config_1 = require("@nestjs/config");
const i18n_service_1 = require("../../common/i18n/i18n.service");
const class_validator_1 = require("class-validator");
const swagger_2 = require("@nestjs/swagger");
class InitiateWithdrawalDto {
    amount;
}
__decorate([
    (0, swagger_2.ApiProperty)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], InitiateWithdrawalDto.prototype, "amount", void 0);
class VerifyWithdrawalDto {
    verification_code;
}
__decorate([
    (0, swagger_2.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], VerifyWithdrawalDto.prototype, "verification_code", void 0);
let WithdrawalController = class WithdrawalController {
    withdrawalService;
    config;
    i18n;
    constructor(withdrawalService, config, i18n) {
        this.withdrawalService = withdrawalService;
        this.config = config;
        this.i18n = i18n;
    }
    async initiate(user, dto, lang) {
        const expiryMins = this.config.get('withdrawal.verificationExpiryMinutes') || 30;
        await this.withdrawalService.initiateWithdrawal(user.id, dto.amount, expiryMins, lang || 'en');
        const message = this.i18n.translate('SUCCESS_WITHDRAWAL_CREATED', lang);
        return { success: true, messages: [message], data: null };
    }
    async verify(user, dto, lang) {
        const result = await this.withdrawalService.processWithdrawal(user.id, dto.verification_code);
        const message = this.i18n.translate('SUCCESS_WITHDRAWAL_VERIFY', lang);
        return { success: true, messages: [message], data: result };
    }
    getHistory(user) {
        return this.withdrawalService.getHistory(user.id);
    }
};
exports.WithdrawalController = WithdrawalController;
__decorate([
    (0, common_1.Post)('withdrawal'),
    (0, swagger_1.ApiOperation)({ summary: 'Initiate a withdrawal (sends verification code)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Headers)('accept-language')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, InitiateWithdrawalDto, String]),
    __metadata("design:returntype", Promise)
], WithdrawalController.prototype, "initiate", null);
__decorate([
    (0, common_1.Post)('verify-withdrawal'),
    (0, swagger_1.ApiOperation)({ summary: 'Confirm withdrawal with verification code' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Headers)('accept-language')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, VerifyWithdrawalDto, String]),
    __metadata("design:returntype", Promise)
], WithdrawalController.prototype, "verify", null);
__decorate([
    (0, common_1.Get)('withdrawal/history'),
    (0, swagger_1.ApiOperation)({ summary: 'Get withdrawal history for current user' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], WithdrawalController.prototype, "getHistory", null);
exports.WithdrawalController = WithdrawalController = __decorate([
    (0, swagger_1.ApiTags)('Withdrawals'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('transactions'),
    __metadata("design:paramtypes", [withdrawal_service_1.WithdrawalService,
        config_1.ConfigService,
        i18n_service_1.I18nService])
], WithdrawalController);
//# sourceMappingURL=withdrawal.controller.js.map