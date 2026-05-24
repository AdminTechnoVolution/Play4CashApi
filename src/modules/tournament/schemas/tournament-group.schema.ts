import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TournamentGroupDocument = TournamentGroup & Document;

@Schema({ versionKey: false, timestamps: true })
export class TournamentGroup {
  @Prop({ type: Types.ObjectId, ref: 'Tournament', required: true, index: true })
  tournament_id: Types.ObjectId;

  @Prop({ required: true, min: 1, max: 5 })
  group_number: number;

  @Prop({ default: 'pending' })
  status: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  winner_user_id?: Types.ObjectId;
}

export const TournamentGroupSchema = SchemaFactory.createForClass(TournamentGroup);
TournamentGroupSchema.index({ tournament_id: 1, group_number: 1 }, { unique: true });
