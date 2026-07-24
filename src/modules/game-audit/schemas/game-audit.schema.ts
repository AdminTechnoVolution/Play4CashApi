import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type GameAuditRunDocument = GameAuditRun & Document;
export type GameAuditFindingDocument = GameAuditFinding & Document;
export type GameAuditReversalDocument = GameAuditReversal & Document;

@Schema({ versionKey: false, timestamps: true })
export class GameAuditRun {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true }) admin_id: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Room' }) room_id?: Types.ObjectId;
  @Prop({ enum: ['all', 'unrefunded', 'with_refunds'], default: 'all' }) review_filter: string;
  @Prop({ enum: ['running', 'completed', 'failed'], default: 'running' }) status: string;
  @Prop({ default: 0 }) scanned_count: number;
  @Prop({ default: 0 }) finding_count: number;
  @Prop() error?: string;
}
export const GameAuditRunSchema = SchemaFactory.createForClass(GameAuditRun);

@Schema({ versionKey: false, timestamps: true })
export class GameAuditFinding {
  @Prop({ type: Types.ObjectId, ref: GameAuditRun.name, required: true, index: true }) run_id: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Room', required: true, index: true }) room_id: Types.ObjectId;
  @Prop({ enum: ['candidate', 'inconclusive', 'partially_refunded', 'refunded', 'discarded'], required: true, index: true }) status: string;
  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] }) affected_player_ids: Types.ObjectId[];
  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] }) refunded_player_ids: Types.ObjectId[];
  @Prop({ type: [Types.ObjectId], ref: 'User', default: [] }) pending_player_ids: Types.ObjectId[];
  @Prop({ default: '' }) reason: string;
}
export const GameAuditFindingSchema = SchemaFactory.createForClass(GameAuditFinding);
GameAuditFindingSchema.index({ run_id: 1, room_id: 1 }, { unique: true });

@Schema({ versionKey: false, timestamps: true })
export class GameAuditReversal {
  @Prop({ type: Types.ObjectId, ref: 'Room', required: true, index: true }) room_id: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'User', required: true }) refunded_player_id: Types.ObjectId;
  @Prop({ required: true }) refunded_username: string;
  @Prop({ type: Types.ObjectId, ref: 'User', required: true }) winner_id: Types.ObjectId;
  @Prop({ required: true }) winner_username: string;
  @Prop({ required: true, min: 0 }) amount: number;
  @Prop({ required: true }) reason: string;
  @Prop({ type: Types.ObjectId, ref: 'User', required: true }) admin_id: Types.ObjectId;
  @Prop({ default: false }) inconclusive_override: boolean;
  @Prop({ enum: ['balance_debited', 'debt_recorded'], required: true }) winner_adjustment: string;
  @Prop({ default: 0 }) debt_created: number;
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} }) balances: Record<string, number>;
}
export const GameAuditReversalSchema = SchemaFactory.createForClass(GameAuditReversal);
GameAuditReversalSchema.index(
  { room_id: 1, refunded_player_id: 1 },
  { unique: true, name: 'room_refunded_player_unique' },
);
