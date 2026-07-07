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
exports.RechargeController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const recharge_service_1 = require("./recharge.service");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const i18n_service_1 = require("../../common/i18n/i18n.service");
const config_1 = require("@nestjs/config");
const class_validator_1 = require("class-validator");
const swagger_2 = require("@nestjs/swagger");
class CreateRechargeDto {
    txId;
    coin;
    amount;
}
__decorate([
    (0, swagger_2.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateRechargeDto.prototype, "txId", void 0);
__decorate([
    (0, swagger_2.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateRechargeDto.prototype, "coin", void 0);
__decorate([
    (0, swagger_2.ApiProperty)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], CreateRechargeDto.prototype, "amount", void 0);
let RechargeController = class RechargeController {
    rechargeService;
    config;
    i18n;
    constructor(rechargeService, config, i18n) {
        this.rechargeService = rechargeService;
        this.config = config;
        this.i18n = i18n;
    }
    async create(user, dto, lang) {
        const expiryMins = this.config.get('withdrawal.processingExpiryMinutes') || 30;
        const result = await this.rechargeService.createRecharge(user.id, dto.txId, dto.coin, dto.amount, expiryMins);
        const message = this.i18n.translate('SUCCESS_RECHARGE', lang);
        return { success: true, messages: [message], data: result };
    }
    getHistory(user) {
        return this.rechargeService.getHistory(user.id);
    }
};
exports.RechargeController = RechargeController;
__decorate([
    (0, common_1.Post)('recharge'),
    (0, swagger_1.ApiOperation)({ summary: 'Submit a deposit transaction for confirmation' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Headers)('accept-language')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, CreateRechargeDto, String]),
    __metadata("design:returntype", Promise)
], RechargeController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('recharge/history'),
    (0, swagger_1.ApiOperation)({ summary: 'Get recharge history for current user' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], RechargeController.prototype, "getHistory", null);
exports.RechargeController = RechargeController = __decorate([
    (0, swagger_1.ApiTags)('Recharges'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('transactions'),
    __metadata("design:paramtypes", [recharge_service_1.RechargeService,
        config_1.ConfigService,
        i18n_service_1.I18nService])
], RechargeController);
//# sourceMappingURL=recharge.controller.js.map