import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type DominoGameDocument = DominoGame & Document;

@Schema({ _id: false })
class OpenEnds {
  @Prop() left: number;
  @Prop() right: number;
}

@Schema({ versionKey: false, timestamps: true })
export class DominoGame {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Room', required: true, unique: true }) room_id: Types.ObjectId;
  @Prop([{ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true }]) player_ids: Types.ObjectId[];
  @Prop({ type: Map, of: [[Number]], required: true }) hands: Map<string, number[][]>;
  @Prop({ type: [[Number]], default: [] }) board: number[][];
  @Prop({ type: [[Number]], default: [] }) boneyard: number[][];
  @Prop({ type: Number, default: 0 }) current_player_index: number;
  @Prop({ type: OpenEnds, _id: false }) open_ends: OpenEnds;
  @Prop({ type: Date, default: Date.now }) turn_start_time: Date;
  @Prop({ type: String, enum: ['active', 'blocked', 'finished'], default: 'active' }) status: string;
  @Prop({ type: Number, default: 0 }) consecutive_passes: number;
  @Prop({ type: [String], default: [] }) eliminated_players: string[];
}
export const DominoGameSchema = SchemaFactory.createForClass(DominoGame);
