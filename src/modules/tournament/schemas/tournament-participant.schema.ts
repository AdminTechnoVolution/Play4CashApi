import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { TournamentParticipantStatus } from '../constants/tournament.constants';

export type TournamentParticipantDocument = TournamentParticipant & Document;

@Schema({ versionKey: false, timestamps: true })
export class TournamentParticipant {
  @Prop({ type: Types.ObjectId, ref: 'Tournament', required: true, index: true })
  tournament_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user_id: Types.ObjectId;

  @Prop({ required: true, trim: true })
  username: string;

  @Prop({
    type: String,
    enum: Object.values(TournamentParticipantStatus),
    default: TournamentParticipantStatus.REGISTERED,
  })
  status: TournamentParticipantStatus;

  @Prop({ min: 1 })
  seed?: number;

  @Prop({ min: 1, max: 500 })
  group_number?: number;

  @Prop({ type: Date, required: true })
  registered_at: Date;

  @Prop({ type: Date })
  eliminated_at?: Date;

  @Prop({ min: 1, max: 50 })
  final_rank?: number;
}

export const TournamentParticipantSchema = SchemaFactory.createForClass(TournamentParticipant);
TournamentParticipantSchema.index({ tournament_id: 1, user_id: 1 }, { unique: true });
TournamentParticipantSchema.index({ tournament_id: 1, seed: 1 });
