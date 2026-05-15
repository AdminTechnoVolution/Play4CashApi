import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type HalmaGameDocument = HalmaGame & Document;

/**
 * Persisted Halma match bound 1:1 to a Room. Fields mirror `HalmaGateway` reads/writes.
 */
@Schema({ versionKey: false, timestamps: true })
export class HalmaGame {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Room', required: true, unique: true })
  room_id: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  player1_id: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  player2_id: Types.ObjectId;

  @Prop({ type: [[MongooseSchema.Types.Mixed]], required: true })
  board: number[][];

  @Prop({ type: Number, enum: [1, 2], default: 1 })
  current_player: 1 | 2;

  /** Jump-chain captures cleared on `end_turn`. */
  @Prop({ type: [[Number]], default: [] })
  pending_captures: [number, number][];

  @Prop({ type: Boolean, default: false })
  must_end_turn: boolean;

  @Prop({ type: Date, default: Date.now })
  turn_start_time: Date;
}

export const HalmaGameSchema = SchemaFactory.createForClass(HalmaGame);
