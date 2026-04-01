import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RechargeDocument = Recharge & Document;

@Schema({ versionKey: false, timestamps: false })
export class Recharge {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true }) user_id: Types.ObjectId;
  @Prop({ required: true }) txId: string;
  @Prop({ required: true }) amount: number;
  @Prop() network: string;
  @Prop() wallet: string;
  @Prop({ required: true, uppercase: true }) coin: string;
  @Prop({
    type: String,
    enum: ['processing', 'confirmed'],
    default: 'processing',
    lowercase: true,
  })
  status: string;
  @Prop({ default: Date.now }) created_at: Date;
  @Prop() confirmed_at: Date;
  @Prop() time_processing_expires_at: Date;
}

export const RechargeSchema = SchemaFactory.createForClass(Recharge);

RechargeSchema.index({ time_processing_expires_at: 1 }, { expireAfterSeconds: 0 });
RechargeSchema.index({ txId: 1 }, { unique: true });
RechargeSchema.index({ user_id: 1 });
RechargeSchema.index({ coin: 1 });
RechargeSchema.index({ status: 1 });
