import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type UnoGameDocument = UnoGame & Document;

@Schema({ versionKey: '__v', timestamps: true, optimisticConcurrency: true })
export class UnoGame {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Room', required: true, unique: true })
  room_id: Types.ObjectId;

  @Prop([{ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true }])
  player_ids: Types.ObjectId[];

  /** Per-player hole cards; keys are user id strings */
  @Prop({ type: Map, of: [String], required: true })
  hands: Map<string, string[]>;

  /** Top of pile = index 0 (draw with shift) */
  @Prop({ type: [String], default: [] })
  draw_pile: string[];

  /** Top discard = last element */
  @Prop({ type: [String], default: [] })
  discard_pile: string[];

  @Prop({ type: Number, default: 0 })
  current_player_index: number;

  @Prop({ type: Number, enum: [1, -1], default: 1 })
  direction: number;

  /** Active color to match (R | G | B | Y) */
  @Prop({ type: String, required: true })
  current_color: string;

  /** Pending draw from stacked +2 / +4 (Fase 3+) */
  @Prop({ type: Number, default: 0 })
  draw_stack_pending: number;

  @Prop({ type: [String], default: [] })
  eliminated_players: string[];

  @Prop({ type: Date, default: Date.now })
  turn_start_time: Date;
}

export const UnoGameSchema = SchemaFactory.createForClass(UnoGame);
