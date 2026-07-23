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
  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] }) spectators: Types.ObjectId[];
  @Prop({ required: true, min: 0 }) bet_amount: number;
  @Prop({ required: true, min: 0, max: 100 }) house_edge: number;
  @Prop({ required: true }) public: boolean;
  @Prop() player_limit: number;
  @Prop({
    type: String,
    enum: Object.values(RoomStatus),
    default: RoomStatus.WAITING,
    lowercase: true,
  })
  status: RoomStatus;
  /** Internal idempotency lock while a gateway prepares durable game state. */
  @Prop()
  start_lock?: string;
  @Prop()
  start_locked_at?: Date;
  @Prop({ default: Date.now }) created_at: Date;
  @Prop({ default: Date.now }) updated_at: Date;
  @Prop() started_at?: Date;
  /** Set only after the game gateway has created durable game state and charged stakes. */
  @Prop() game_ready_at?: Date;
  @Prop() finished_at: Date;
  @Prop({ type: Types.ObjectId, ref: 'User' }) winner: Types.ObjectId;
  @Prop() winner_reason: string;
  @Prop() turn_start_time: Date;
  @Prop({ type: String, enum: ['casual', 'tournament'], default: 'casual' })
  source: string;
  @Prop({ type: Types.ObjectId, ref: 'Tournament' })
  tournament_id?: Types.ObjectId;
  @Prop({ type: Types.ObjectId })
  tournament_match_id?: Types.ObjectId;
  /** Override game catalog turn timer (tournament rooms). */
  @Prop({ min: 1 })
  turn_timer_seconds?: number;
}

export const RoomSchema = SchemaFactory.createForClass(Room);

RoomSchema.index({ game_id: 1 });
RoomSchema.index({ status: 1 });
RoomSchema.index({ winner: 1 });
RoomSchema.index({ 'players.playerId': 1 });
RoomSchema.index({ 'players.playerId': 1, game_id: 1 });

// Phase C: one-active-room-per-user. A user can appear in at most one room whose
// status is still `waiting` or `started`. The partial filter excludes `finished`
// rooms so historical participation never blocks new joins. If the user is already
// in an open room and tries to create/join another, Mongo throws E11000 and the
// service layer translates it into ERROR_USER_ALREADY_IN_ROOM.
RoomSchema.index(
  { 'players.playerId': 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: [RoomStatus.WAITING, RoomStatus.STARTED] } },
    name: 'players_playerId_active_unique',
  },
);
