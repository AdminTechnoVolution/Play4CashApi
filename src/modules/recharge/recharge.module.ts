import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RechargeController } from './recharge.controller';
import { RechargeService } from './recharge.service';
import { Recharge, RechargeSchema } from './schemas/recharge.schema';
import { RechargeIntent, RechargeIntentSchema } from './schemas/recharge-intent.schema';
import { User, UserSchema } from '../user/schemas/user.schema';
import { IdempotencyModule } from '../../common/idempotency/idempotency.module';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [
    IdempotencyModule,
    WalletModule,
    MongooseModule.forFeature([
      { name: Recharge.name, schema: RechargeSchema },
      { name: RechargeIntent.name, schema: RechargeIntentSchema },
      { name: User.name, schema: UserSchema },
      { name: 'TxMessage', schema: new (require('mongoose').Schema)({
        user_id: { type: require('mongoose').Schema.Types.ObjectId },
        txId: String, amount: Number, coin: String, message: String, txType: String,
        created_at: { type: Date, default: Date.now },
      }) },
    ]),
  ],
  controllers: [RechargeController],
  providers: [RechargeService],
})
export class RechargeModule {}
