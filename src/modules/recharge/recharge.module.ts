import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RechargeController } from './recharge.controller';
import { RechargeService } from './recharge.service';
import { Recharge, RechargeSchema } from './schemas/recharge.schema';
import { User, UserSchema } from '../user/schemas/user.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Recharge.name, schema: RechargeSchema },
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
