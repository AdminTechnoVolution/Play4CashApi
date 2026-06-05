import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export enum ContactMessageType {
  COMMENT = 'comment',
  SUGGESTION = 'suggestion',
  ERROR = 'error',
}

export enum ContactMessageStatus {
  NEW = 'new',
  READ = 'read',
  RESOLVED = 'resolved',
}

export type ContactMessageDocument = ContactMessage & Document;

@Schema({ versionKey: false, timestamps: true })
export class ContactMessage {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user_id: Types.ObjectId;

  @Prop({ required: true, trim: true })
  email: string;

  @Prop({ required: true, trim: true })
  username: string;

  @Prop({ type: String, enum: Object.values(ContactMessageType), required: true })
  type: ContactMessageType;

  @Prop({ required: true, trim: true, minlength: 10, maxlength: 2000 })
  message: string;

  @Prop({ type: [Types.ObjectId], ref: 'Game', default: [] })
  game_ids: Types.ObjectId[];

  @Prop({ default: false })
  all_games: boolean;

  @Prop({ type: [String], default: [] })
  game_labels: string[];

  @Prop({
    type: String,
    enum: Object.values(ContactMessageStatus),
    default: ContactMessageStatus.NEW,
    index: true,
  })
  status: ContactMessageStatus;

  @Prop({ trim: true, default: '' })
  admin_notes: string;
}

export const ContactMessageSchema = SchemaFactory.createForClass(ContactMessage);
