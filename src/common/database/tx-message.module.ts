import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Schema, Types } from 'mongoose';

const TxMessageSchema = new Schema({
  user_id: { type: Types.ObjectId, ref: 'User' },
  txId: String,
  amount: Number,
  coin: String,
  message: String,
  txType: { type: String, enum: ['recharge', 'withdrawal'], default: 'recharge' },
  created_at: { type: Date, default: Date.now },
});

@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: 'TxMessage', schema: TxMessageSchema }])],
  exports: [MongooseModule],
})
export class TxMessageModule {}
