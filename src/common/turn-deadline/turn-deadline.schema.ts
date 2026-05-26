import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TurnDeadlineDocument = TurnDeadline & Document;

@Schema({ collection: 'turn_deadlines', versionKey: false })
export class TurnDeadline {
  @Prop({ required: true, index: true })
  game_name: string;

  @Prop({ required: true, index: true })
  room_id: string;

  @Prop({ required: true })
  player_id: string;

  @Prop({ required: true, index: true })
  expires_at: Date;

  @Prop({ default: false })
  processing: boolean;
}

export const TurnDeadlineSchema = SchemaFactory.createForClass(TurnDeadline);
TurnDeadlineSchema.index({ game_name: 1, room_id: 1 }, { unique: true });
TurnDeadlineSchema.index({ expires_at: 1, processing: 1 });
