import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type WalletDocument = WalletEntry & Document;

@Schema({ versionKey: false, timestamps: false, collection: 'wallets' })
export class WalletEntry {
  @Prop({ required: true, uppercase: true }) coin: string;
  @Prop({ required: true }) address: string;
  @Prop({ required: true }) red: string;
  @Prop() description: string;
  @Prop({ required: true, default: 0 }) minAmount: number;
  @Prop({ required: true, default: 0 }) networkWithdrawalFee: number;
  @Prop({ default: true }) isActive: boolean;
}

export const WalletSchema = SchemaFactory.createForClass(WalletEntry);
WalletSchema.index({ coin: 1 });
WalletSchema.index({ isActive: 1 });
