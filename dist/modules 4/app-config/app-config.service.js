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
exports.AppConfigService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const app_config_schema_1 = require("./schemas/app-config.schema");
const business_exception_1 = require("../../common/exceptions/business.exception");
let AppConfigService = class AppConfigService {
    configModel;
    constructor(configModel) {
        this.configModel = configModel;
    }
    async getRawConfig() {
        let config = await this.configModel.findOne({ key: 'global' }).lean();
        if (!config) {
            config = await this.configModel.findOneAndUpdate({ key: 'global' }, { $setOnInsert: { key: 'global', withdrawal_daily_limit: 10000 } }, { upsert: true, returnDocument: 'after', lean: true });
        }
        return config;
    }
    async getConfig() {
        const config = await this.getRawConfig();
        return { withdrawal_daily_limit: config.withdrawal_daily_limit };
    }
    async updateConfig(data) {
        const { withdrawal_daily_limit } = data;
        if (withdrawal_daily_limit === undefined || isNaN(withdrawal_daily_limit) || withdrawal_daily_limit <= 0) {
            throw new business_exception_1.BusinessException('ERROR_BAD_REQUEST_RESPONSE', 400);
        }
        const config = await this.configModel.findOneAndUpdate({ key: 'global' }, { $set: { withdrawal_daily_limit } }, { returnDocument: 'after', upsert: true, lean: true });
        return { withdrawal_daily_limit: config.withdrawal_daily_limit };
    }
};
exports.AppConfigService = AppConfigService;
exports.AppConfigService = AppConfigService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(app_config_schema_1.AppConfig.name)),
    __metadata("design:paramtypes", [mongoose_2.Model])
], AppConfigService);
//# sourceMappingURL=app-config.service.js.map