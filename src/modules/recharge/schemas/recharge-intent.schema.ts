import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type RechargeIntentDocument = RechargeIntent & Document;

/**
 * Reserves an exact deposit amount for a user before they send funds to the
 * platform's shared coin/network wallet. `createRecharge` only credits a
 * txId whose on-chain amount matches an unclaimed, unexpired intent owned
 * by the claiming user — this is what stops any authenticated user from
 * claiming someone else's deposit by racing a publicly-visible txId.
 */
@Schema({ versionKey: false, timestamps: false, collection: 'recharge_intents' })
export class RechargeIntent {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true }) user_id: Types.ObjectId;
  @Prop({ required: true, uppercase: true }) coin: string;
  @Prop({ required: true }) network: string;
  @Prop({ required: true }) requestedAmount: number;
  @Prop({ required: true }) exactAmount: number;
  @Prop({ required: true }) address: string;
  @Prop({
    type: String,
    enum: ['pending', 'claimed'],
    default: 'pending',
    lowercase: true,
  })
  status: string;
  @Prop({ default: Date.now }) created_at: Date;
  @Prop() claimed_at: Date;
  @Prop() txId: string;
  @Prop() expires_at: Date;
}

export const RechargeIntentSchema = SchemaFactory.createForClass(RechargeIntent);

// TTL: unclaimed intents self-clean once expired. Claimed intents have
// expires_at unset (mirrors the Recharge processing-expiry pattern) so they
// persist for audit history.
RechargeIntentSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });
RechargeIntentSchema.index({ user_id: 1, status: 1 });
// Only one unclaimed reservation may hold a given exact amount per coin/network
// at a time — guarantees DB-level collision safety when generating fingerprints.
RechargeIntentSchema.index(
  { coin: 1, network: 1, exactAmount: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } },
);
