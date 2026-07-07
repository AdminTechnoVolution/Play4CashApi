"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WithdrawalModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const withdrawal_controller_1 = require("./withdrawal.controller");
const withdrawal_service_1 = require("./withdrawal.service");
const withdrawal_schema_1 = require("./schemas/withdrawal.schema");
const user_schema_1 = require("../user/schemas/user.schema");
const wallet_module_1 = require("../wallet/wallet.module");
const app_config_module_1 = require("../app-config/app-config.module");
const withdrawal_processing_job_1 = require("../../common/jobs/withdrawal-processing.job");
let WithdrawalModule = class WithdrawalModule {
};
exports.WithdrawalModule = WithdrawalModule;
exports.WithdrawalModule = WithdrawalModule = __decorate([
    (0, common_1.Module)({
        imports: [
            mongoose_1.MongooseModule.forFeature([
                { name: withdrawal_schema_1.Withdrawal.name, schema: withdrawal_schema_1.WithdrawalSchema },
                { name: user_schema_1.User.name, schema: user_schema_1.UserSchema },
            ]),
            wallet_module_1.WalletModule,
            app_config_module_1.AppConfigModule,
        ],
        controllers: [withdrawal_controller_1.WithdrawalController],
        providers: [withdrawal_service_1.WithdrawalService, withdrawal_processing_job_1.WithdrawalProcessingJob],
        exports: [withdrawal_service_1.WithdrawalService],
    })
], WithdrawalModule);
//# sourceMappingURL=withdrawal.module.js.map