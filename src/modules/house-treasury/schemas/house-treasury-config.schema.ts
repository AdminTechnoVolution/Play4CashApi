import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type HouseTreasuryConfigDocument = HouseTreasuryConfig & Document;

@Schema({ versionKey: false, timestamps: false })
export class HouseTreasuryConfig {
  @Prop({ required: true, unique: true, default: 'main' }) key: string;
  @Prop({ required: true, default: Date.now }) activated_at: Date;
  /** Serialized balance used to prevent concurrent withdrawals from overspending. */
  @Prop({ required: true, default: 0 }) ledger_balance: number;
}

export const HouseTreasuryConfigSchema = SchemaFactory.createForClass(HouseTreasuryConfig);
