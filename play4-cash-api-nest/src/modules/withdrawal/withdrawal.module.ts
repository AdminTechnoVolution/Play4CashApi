import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WithdrawalController } from './withdrawal.controller';
import { WithdrawalService } from './withdrawal.service';
import { Withdrawal, WithdrawalSchema } from './schemas/withdrawal.schema';
import { User, UserSchema } from '../user/schemas/user.schema';
import { WalletModule } from '../wallet/wallet.module';
import { AppConfigModule } from '../app-config/app-config.module';
import { WithdrawalProcessingJob } from '../../common/jobs/withdrawal-processing.job';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Withdrawal.name, schema: WithdrawalSchema },
      { name: User.name, schema: UserSchema },
    ]),
    WalletModule,
    AppConfigModule,
  ],
  controllers: [WithdrawalController],
  providers: [WithdrawalService, WithdrawalProcessingJob],
  exports: [WithdrawalService],
})
export class WithdrawalModule {}
