import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import type { ConnectFourBoard } from '../connect-four-game.logic';

export type ConnectFourGameDocument = ConnectFourGame & Document;

@Schema({ versionKey: false, timestamps: true })
export class ConnectFourGame {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Room', required: true, unique: true })
  room_id: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  player1_id: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  player2_id: Types.ObjectId;

  @Prop({ type: [[MongooseSchema.Types.Mixed]], required: true })
  board: ConnectFourBoard;

  @Prop({ type: Number, enum: [1, 2], default: 1 })
  current_player: number;

  @Prop({ type: [[Number]], default: [] })
  winning_cells: Array<{ row: number; col: number }>;

  @Prop({ type: Date, default: Date.now })
  turn_start_time: Date;
}

export const ConnectFourGameSchema = SchemaFactory.createForClass(ConnectFourGame);
