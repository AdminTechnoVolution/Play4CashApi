import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type WithdrawalDocument = Withdrawal & Document;

@Schema({ versionKey: false, timestamps: false })
export class Withdrawal {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true }) user_id: Types.ObjectId;
  @Prop({ required: true }) amount: number;
  @Prop({ required: true, uppercase: true }) coin: string;
  @Prop({ required: true }) wallet: string;
  @Prop() id_binance: string;
  @Prop({ default: 0 }) tx_fee: number;
  @Prop({ type: String, enum: ['internal', 'external', 'unknown'] }) transfer_type: string;
  @Prop({ type: String, enum: ['spot', 'funding', 'unknown'] }) wallet_type: string;
  @Prop() txId: string;
  @Prop() network: string;
  @Prop({
    type: String,
    enum: ['pending_verify', 'processing', 'confirmed', 'failed'],
    default: 'pending_verify',
    lowercase: true,
  })
  status: string;
  @Prop({ default: Date.now }) created_at: Date;
  @Prop() confirmed_at: Date;
  @Prop() confirmed_at_binance: Date;
  @Prop() verification_code: string;
  @Prop() verification_expires_at: Date;
}

export const WithdrawalSchema = SchemaFactory.createForClass(Withdrawal);

WithdrawalSchema.index({ verification_expires_at: 1 }, { expireAfterSeconds: 0 });
WithdrawalSchema.index({ wallet_type: 1 });
WithdrawalSchema.index({ transfer_type: 1 });
WithdrawalSchema.index({ wallet: 1 });
WithdrawalSchema.index({ user_id: 1 });
WithdrawalSchema.index({ coin: 1 });
WithdrawalSchema.index({ status: 1 });
