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

  @Prop({ type: [{ row: { type: Number }, col: { type: Number } }], default: [] })
  winning_cells: Array<{ row: number; col: number }>;

  @Prop({ type: Date, default: Date.now })
  turn_start_time: Date;

  @Prop({
    type: {
      userId: { type: String },
      row: { type: Number },
      col: { type: Number },
      color: { type: String, enum: ['R', 'Y'] },
      at: { type: Date },
    },
    required: false,
  })
  last_move?: {
    userId: string;
    row: number;
    col: number;
    color: 'R' | 'Y';
    at: Date;
  };

  /** Monotonic counter incremented on each successful drop_disc — used to reject stale WS payloads. */
  @Prop({ type: Number, default: 0 })
  move_revision: number;
}

export const ConnectFourGameSchema = SchemaFactory.createForClass(ConnectFourGame);
