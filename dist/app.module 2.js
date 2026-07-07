"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const mongoose_1 = require("@nestjs/mongoose");
const schedule_1 = require("@nestjs/schedule");
const throttler_1 = require("@nestjs/throttler");
const core_1 = require("@nestjs/core");
const common_2 = require("@nestjs/common");
const configuration_1 = __importDefault(require("./common/config/configuration"));
const redis_module_1 = require("./common/redis/redis.module");
const auth_guard_1 = require("./common/guards/auth.guard");
const global_exception_filter_1 = require("./common/filters/global-exception.filter");
const response_interceptor_1 = require("./common/interceptors/response.interceptor");
const auth_module_1 = require("./modules/auth/auth.module");
const user_module_1 = require("./modules/user/user.module");
const game_module_1 = require("./modules/game/game.module");
const recharge_module_1 = require("./modules/recharge/recharge.module");
const tx_message_module_1 = require("./common/database/tx-message.module");
const withdrawal_module_1 = require("./modules/withdrawal/withdrawal.module");
const wallet_module_1 = require("./modules/wallet/wallet.module");
const app_config_module_1 = require("./modules/app-config/app-config.module");
const websockets_module_1 = require("./modules/websockets/websockets.module");
const room_module_1 = require("./modules/room/room.module");
const email_module_1 = require("./common/email/email.module");
const i18n_module_1 = require("./common/i18n/i18n.module");
const greeting_module_1 = require("./modules/greeting/greeting.module");
const app_version_module_1 = require("./modules/app-version/app-version.module");
const grace_period_module_1 = require("./common/grace-period/grace-period.module");
const idempotency_module_1 = require("./common/idempotency/idempotency.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                load: [configuration_1.default],
                envFilePath: '.env',
            }),
            mongoose_1.MongooseModule.forRootAsync({
                inject: [config_1.ConfigService],
                useFactory: (config) => ({
                    uri: config.get('mongoUri'),
                }),
            }),
            redis_module_1.RedisModule,
            schedule_1.ScheduleModule.forRoot(),
            throttler_1.ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
            tx_message_module_1.TxMessageModule,
            auth_module_1.AuthModule,
            user_module_1.UserModule,
            game_module_1.GameModule,
            recharge_module_1.RechargeModule,
            withdrawal_module_1.WithdrawalModule,
            wallet_module_1.WalletModule,
            app_config_module_1.AppConfigModule,
            room_module_1.RoomModule,
            websockets_module_1.WebsocketsModule,
            email_module_1.EmailModule,
            i18n_module_1.I18nModule,
            greeting_module_1.GreetingModule,
            app_version_module_1.AppVersionModule,
            grace_period_module_1.GracePeriodModule,
            idempotency_module_1.IdempotencyModule,
        ],
        providers: [
            { provide: core_1.APP_GUARD, useClass: throttler_1.ThrottlerGuard },
            { provide: core_1.APP_GUARD, useClass: auth_guard_1.AuthGuard },
            { provide: core_1.APP_FILTER, useClass: global_exception_filter_1.GlobalExceptionFilter },
            { provide: core_1.APP_INTERCEPTOR, useClass: response_interceptor_1.ResponseInterceptor },
            { provide: core_1.APP_PIPE, useFactory: () => new common_2.ValidationPipe({ whitelist: true, transform: true }) },
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map