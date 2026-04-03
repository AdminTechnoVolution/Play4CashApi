import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type HalmaGameDocument = HalmaGame & Document;

@Schema({ versionKey: false, timestamps: true })
export class HalmaGame {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Room', required: true, unique: true }) room_id: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true }) player1_id: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true }) player2_id: Types.ObjectId;
  @Prop({ type: [[Number]], required: true }) board: number[][];
  @Prop({ type: Number, enum: [1, 2], default: 1 }) current_player: number;
  @Prop({ default: false }) prevent_leave_goal: boolean;
  @Prop({ type: Date, default: Date.now }) turn_start_time: Date;
  @Prop({ type: [[Number]], default: [] }) pending_captures: number[][]; // [row, col][]
}
export const HalmaGameSchema = SchemaFactory.createForClass(HalmaGame);
