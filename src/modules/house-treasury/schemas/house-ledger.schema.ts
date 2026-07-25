import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type HouseLedgerDocument = HouseLedger & Document;

export enum HouseLedgerType {
  CASUAL_GAME_FEE = 'casual_game_fee',
  TOURNAMENT_FEE = 'tournament_fee',
  HOUSE_WITHDRAWAL = 'house_withdrawal',
  ADJUSTMENT_CREDIT = 'adjustment_credit',
  ADJUSTMENT_DEBIT = 'adjustment_debit',
}

@Schema({ versionKey: false, timestamps: { createdAt: 'created_at', updatedAt: false } })
export class HouseLedger {
  @Prop({ type: String, enum: Object.values(HouseLedgerType), required: true, index: true })
  type: HouseLedgerType;

  /** Signed USDT amount. Income is positive and withdrawals/debits are negative. */
  @Prop({ required: true })
  amount: number;

  @Prop({ default: 'USDT', immutable: true })
  currency: string;

  @Prop({ required: true, unique: true, immutable: true })
  idempotency_key: string;

  @Prop({ type: Types.ObjectId, ref: 'Room', index: true })
  room_id?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Tournament', index: true })
  tournament_id?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'HouseWithdrawal', index: true })
  withdrawal_id?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'HouseLedger' })
  correction_of?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  administrator_id?: Types.ObjectId;

  @Prop() game_code?: string;
  @Prop() bet_amount?: number;
  @Prop() house_edge?: number;
  @Prop({ required: true }) occurred_at: Date;
  @Prop() description?: string;
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  metadata?: Record<string, unknown>;
  created_at?: Date;
}

export const HouseLedgerSchema = SchemaFactory.createForClass(HouseLedger);
HouseLedgerSchema.index({ occurred_at: -1, _id: -1 });
HouseLedgerSchema.index({ room_id: 1, type: 1 });

