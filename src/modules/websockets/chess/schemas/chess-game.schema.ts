import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type ChessGameDocument = ChessGame & Document;

@Schema({ versionKey: false, timestamps: true })
export class ChessGame {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Room', required: true, unique: true }) room_id: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true }) player1_id: Types.ObjectId;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true }) player2_id: Types.ObjectId;
  @Prop({ type: [[MongooseSchema.Types.Mixed]], required: true }) board: any[][];
  @Prop({ type: Number, enum: [1, 2], default: 1 }) current_player: number;
  @Prop({ type: MongooseSchema.Types.Mixed, default: { wK: true, wQ: true, bK: true, bQ: true } }) castling_rights: any;
  @Prop({ type: MongooseSchema.Types.Mixed, default: null }) en_passant_target: any;
  @Prop({ type: [MongooseSchema.Types.Mixed], default: [] }) history: any[];
  @Prop({ type: Date, default: Date.now }) turn_start_time: Date;
}
export const ChessGameSchema = SchemaFactory.createForClass(ChessGame);
