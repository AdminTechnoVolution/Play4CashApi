import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import configuration from './common/config/configuration';
import { RedisModule } from './common/redis/redis.module';
import { AuthGuard } from './common/guards/auth.guard';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { GameModule } from './modules/game/game.module';
import { RechargeModule } from './modules/recharge/recharge.module';
import { TxMessageModule } from './common/database/tx-message.module';
import { WithdrawalModule } from './modules/withdrawal/withdrawal.module';
import { WalletModule } from './modules/wallet/wallet.module';
import { AppConfigModule } from './modules/app-config/app-config.module';
import { WebsocketsModule } from './modules/websockets/websockets.module';
import { RoomModule } from './modules/room/room.module';
import { EmailModule } from './common/email/email.module';
import { I18nModule } from './common/i18n/i18n.module';

// Feature modules (added as migration progresses)
// import { AuthModule } from './modules/auth/auth.module';
// import { UserModule } from './modules/user/user.module';
// import { GameModule } from './modules/game/game.module';
// import { RoomModule } from './modules/room/room.module';
// import { RechargeModule } from './modules/recharge/recharge.module';
// import { WithdrawalModule } from './modules/withdrawal/withdrawal.module';
// import { WalletModule } from './modules/wallet/wallet.module';
// import { AppConfigModule } from './modules/app-config/app-config.module';

@Module({
  imports: [
    // ─── Config (global, typed) ───────────────────────────────────────────────
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: '.env',
    }),

    // ─── Database ─────────────────────────────────────────────────────────────
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.get<string>('mongoUri'),
      }),
    }),

    // ─── Redis ────────────────────────────────────────────────────────────────
    RedisModule,

    // ─── Scheduling (cron jobs) ───────────────────────────────────────────────
    ScheduleModule.forRoot(),

    // ─── Rate Limiting ────────────────────────────────────────────────────────
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 10 },       // 10 req/sec
      { name: 'medium', ttl: 60_000, limit: 300 },   // 300 req/min
      { name: 'login', ttl: 900_000, limit: 20 },    // 20 req/15 min (login)
    ]),

    // Feature Modules
    TxMessageModule,
    AuthModule,
    UserModule,
    GameModule,
    RechargeModule,
    WithdrawalModule,
    WalletModule,
    AppConfigModule,
    RoomModule,
    WebsocketsModule,
    EmailModule,
    I18nModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_PIPE, useFactory: () => new ValidationPipe({ whitelist: true, transform: true }) },
  ],
})
export class AppModule {}
