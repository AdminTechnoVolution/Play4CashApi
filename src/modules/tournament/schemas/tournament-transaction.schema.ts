import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { TournamentTransactionType } from '../constants/tournament.constants';

export type TournamentTransactionDocument = TournamentTransaction & Document;

@Schema({ versionKey: false, timestamps: true })
export class TournamentTransaction {
  @Prop({ type: Types.ObjectId, ref: 'Tournament', required: true, index: true })
  tournament_id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  user_id?: Types.ObjectId;

  @Prop({ type: String, enum: Object.values(TournamentTransactionType), required: true })
  type: TournamentTransactionType;

  @Prop({ required: true })
  amount: number;

  @Prop({ default: 'completed' })
  status: string;

  @Prop({ trim: true, sparse: true, unique: true })
  idempotency_key?: string;

  @Prop({ trim: true })
  reference?: string;
}

export const TournamentTransactionSchema = SchemaFactory.createForClass(TournamentTransaction);
