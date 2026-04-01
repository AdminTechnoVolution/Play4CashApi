import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type RoomDocument = Room & Document;

@Schema({ _id: false })
export class Move {
  @Prop({ type: MongooseSchema.Types.Mixed, default: {} }) data: Record<string, any>;
}

@Schema({ _id: false })
export class RoomPlayer {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true }) playerId: Types.ObjectId;
  @Prop({ default: false }) ready: boolean;
  @Prop({ type: [Move], default: [] }) moves: Move[];
}

export enum RoomStatus {
  WAITING = 'waiting',
  STARTED = 'started',
  FINISHED = 'finished',
}

@Schema({ versionKey: false, timestamps: false })
export class Room {
  @Prop() name: string;
  @Prop({ required: true, unique: true }) code: string;
  @Prop({ type: Types.ObjectId, ref: 'Game', required: true }) game_id: Types.ObjectId;
  @Prop({ type: [RoomPlayer], default: [] }) players: RoomPlayer[];
  @Prop({ required: true, min: 1 }) bet_amount: number;
  @Prop({ required: true, min: 1, max: 100 }) house_edge: number;
  @Prop({ required: true }) public: boolean;
  @Prop() player_limit: number;
  @Prop({
    type: String,
    enum: Object.values(RoomStatus),
    default: RoomStatus.WAITING,
    lowercase: true,
  })
  status: RoomStatus;
  @Prop({ default: Date.now }) created_at: Date;
  @Prop() finished_at: Date;
  @Prop({ type: Types.ObjectId, ref: 'User' }) winner: Types.ObjectId;
  @Prop({ lowercase: true }) winner_reason: string;
}

export const RoomSchema = SchemaFactory.createForClass(Room);

RoomSchema.index({ game_id: 1 });
RoomSchema.index({ status: 1 });
RoomSchema.index({ winner: 1 });
RoomSchema.index({ 'players.playerId': 1 });
RoomSchema.index({ 'players.playerId': 1, game_id: 1 });
