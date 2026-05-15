import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WalletChangePendingDocument = WalletChangePending & Document;

/** One pending wallet change per user (OTP sent by email). */
@Schema({ collection: 'wallet_change_pending', versionKey: false })
export class WalletChangePending {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user_id: Types.ObjectId;

  @Prop({ required: true })
  coin: string;

  @Prop({ required: true })
  network: string;

  @Prop({ required: true })
  wallet: string;

  @Prop({ required: true })
  verification_code: string;

  @Prop({ required: true })
  verification_expires_at: Date;
}

export const WalletChangePendingSchema = SchemaFactory.createForClass(WalletChangePending);
WalletChangePendingSchema.index({ user_id: 1 }, { unique: true });
