import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  LanguageField,
  LanguageFieldSchema,
} from '../../game/schemas/game.schema';
import {
  TOURNAMENT_GROUP_SIZE,
  TOURNAMENT_MIN_PLAYERS,
  TournamentPhase,
  TournamentStatus,
} from '../constants/tournament.constants';

export type TournamentDocument = Tournament & Document;

@Schema({ versionKey: false, timestamps: true })
export class Tournament {
  @Prop({ type: LanguageFieldSchema, _id: false, required: true })
  title: LanguageField;

  @Prop({ type: LanguageFieldSchema, _id: false, default: () => ({ en: '', es: '', fr: '', de: '', it: '', pt: '' }) })
  description: LanguageField;

  @Prop({ type: Types.ObjectId, ref: 'Game', required: true, index: true })
  game_id: Types.ObjectId;

  @Prop({ required: true, trim: true })
  game_socket_code: string;

  @Prop({
    type: String,
    enum: Object.values(TournamentStatus),
    default: TournamentStatus.DRAFT,
    index: true,
  })
  status: TournamentStatus;

  @Prop({ required: true, min: 0.01 })
  buy_in: number;

  @Prop({ required: true, default: 8, min: TOURNAMENT_MIN_PLAYERS })
  max_players: number;

  @Prop({ required: true, default: 4, min: TOURNAMENT_MIN_PLAYERS })
  min_players: number;

  @Prop({ required: true, min: 1 })
  group_count: number;

  @Prop({ required: true, default: TOURNAMENT_GROUP_SIZE, min: TOURNAMENT_GROUP_SIZE, max: TOURNAMENT_GROUP_SIZE })
  group_size: number;

  @Prop({ default: 0, min: 0 })
  registered_count: number;

  @Prop({ required: true, type: Date })
  starts_at: Date;

  @Prop({ type: Date })
  registration_opens_at?: Date;

  @Prop({ type: Date })
  registration_closes_at?: Date;

  @Prop({ default: 10, min: 0, max: 100 })
  house_fee_percent: number;

  @Prop({ default: 70, min: 0, max: 100 })
  first_place_percent: number;

  @Prop({ default: 20, min: 0, max: 100 })
  second_place_percent: number;

  @Prop({ default: 0, min: 0 })
  gross_prize_pool: number;

  @Prop({ default: 0, min: 0 })
  house_amount: number;

  @Prop({ default: 0, min: 0 })
  first_place_amount: number;

  @Prop({ default: 0, min: 0 })
  second_place_amount: number;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  winner_user_id?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  runner_up_user_id?: Types.ObjectId;

  @Prop({ default: 30, min: 15, max: 180 })
  turn_timer_seconds: number;

  @Prop({ default: 300, min: 60, max: 900 })
  between_rounds_pause_seconds: number;

  @Prop({ default: 90, min: 30, max: 180 })
  presence_window_seconds: number;

  @Prop({ default: 60, min: 30, max: 300 })
  rematch_delay_seconds: number;

  @Prop({ trim: true })
  bracket_seed?: string;

  @Prop({
    type: String,
    enum: Object.values(TournamentPhase),
    default: TournamentPhase.GROUPS,
  })
  current_phase: TournamentPhase;

  @Prop({ default: 0, min: 0 })
  current_round_index: number;

  @Prop({ type: Date })
  between_rounds_ends_at?: Date;

  @Prop({ type: Date })
  presence_window_ends_at?: Date;

  @Prop({ default: false })
  prizes_settled: boolean;

  @Prop({ type: Date })
  finished_at?: Date;
}

export const TournamentSchema = SchemaFactory.createForClass(Tournament);
TournamentSchema.index({ status: 1, starts_at: 1 });
