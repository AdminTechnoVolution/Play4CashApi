import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type BattleshipPlacementDocument = BattleshipPlacement & Document;

@Schema({ _id: false })
export class Ship {
  @Prop({ required: true, enum: ['carrier','battleship','cruiser','submarine','destroyer'] }) type: string;
  @Prop({ required: true, min: 0, max: 9 }) startRow: number;
  @Prop({ required: true, min: 0, max: 9 }) startCol: number;
  @Prop({ required: true }) isHorizontal: boolean;
  @Prop({ type: [[Number]], required: true }) cells: number[][];
}
export const ShipSchema = SchemaFactory.createForClass(Ship);

@Schema({ versionKey: false, timestamps: true })
export class BattleshipPlacement {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Room', required: true }) room_id: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true }) player_id: Types.ObjectId;
  @Prop({ type: [ShipSchema], required: true }) ships: Ship[];
  @Prop({ type: [[Number]], default: [] }) shotsFired: number[][];
  @Prop({ type: Date, default: Date.now }) ready_at: Date;
  @Prop({ type: String, enum: ['placed', 'ready'], default: 'placed' }) status: string;
}
export const BattleshipPlacementSchema = SchemaFactory.createForClass(BattleshipPlacement);
BattleshipPlacementSchema.index({ room_id: 1, player_id: 1 }, { unique: true });
