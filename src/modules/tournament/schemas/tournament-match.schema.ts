import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  TournamentMatchRoundName,
  TournamentMatchStatus,
  TournamentPhase,
} from '../constants/tournament.constants';

export type TournamentMatchDocument = TournamentMatch & Document;

@Schema({ versionKey: false, timestamps: true })
export class TournamentMatch {
  @Prop({ type: Types.ObjectId, ref: 'Tournament', required: true, index: true })
  tournament_id: Types.ObjectId;

  @Prop({ min: 1, max: 5 })
  group_number?: number;

  @Prop({
    type: String,
    enum: Object.values(TournamentPhase),
    default: TournamentPhase.GROUPS,
  })
  phase: TournamentPhase;

  @Prop({ type: String, enum: Object.values(TournamentMatchRoundName), required: true })
  round_name: TournamentMatchRoundName;

  @Prop({ required: true, min: 0 })
  round_index: number;

  @Prop({ required: true, min: 0 })
  match_index: number;

  @Prop({
    type: String,
    enum: Object.values(TournamentMatchStatus),
    default: TournamentMatchStatus.PENDING,
  })
  status: TournamentMatchStatus;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  player_a_user_id?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  player_b_user_id?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  winner_user_id?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  loser_user_id?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Room' })
  room_id?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'TournamentMatch' })
  next_match_id?: Types.ObjectId;

  @Prop({ type: String, enum: ['A', 'B'] })
  next_slot?: 'A' | 'B';

  @Prop({ default: false })
  is_bye: boolean;

  @Prop({ type: Date })
  starts_at?: Date;

  @Prop({ type: Date })
  presence_check_at?: Date;

  @Prop({ type: Date })
  started_at?: Date;

  @Prop({ type: Date })
  finished_at?: Date;

  @Prop({ trim: true })
  result_reason?: string;
}

export const TournamentMatchSchema = SchemaFactory.createForClass(TournamentMatch);
TournamentMatchSchema.index({ tournament_id: 1, round_index: 1, status: 1 });
TournamentMatchSchema.index({ tournament_id: 1, phase: 1, round_name: 1 });
