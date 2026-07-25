import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type HouseWithdrawalDocument = HouseWithdrawal & Document;

@Schema({ versionKey: false, timestamps: { createdAt: 'created_at', updatedAt: false } })
export class HouseWithdrawal {
  @Prop({ required: true }) amount: number;
  @Prop({ default: 'USDT', immutable: true }) currency: string;
  @Prop({ required: true, trim: true }) purpose: string;
  @Prop({ required: true, trim: true }) category: string;
  @Prop({ required: true, trim: true }) destination: string;
  @Prop({ required: true, trim: true }) external_reference: string;
  @Prop({ trim: true }) notes?: string;
  @Prop({ required: true }) occurred_at: Date;
  @Prop({ type: Types.ObjectId, ref: 'User', required: true }) administrator_id: Types.ObjectId;
  @Prop({ required: true, unique: true }) idempotency_key: string;
  @Prop({ default: 'completed', immutable: true }) status: string;
  created_at?: Date;
}

export const HouseWithdrawalSchema = SchemaFactory.createForClass(HouseWithdrawal);
HouseWithdrawalSchema.index({ occurred_at: -1 });

