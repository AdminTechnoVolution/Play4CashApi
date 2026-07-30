import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export enum AdminStatus {
  ACTIVE = 'active',
  DISABLED = 'disabled',
}

@Schema({
  collection: 'admins',
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
})
export class Admin {
  @Prop({ required: true, lowercase: true, trim: true, immutable: true })
  email: string;

  @Prop({ trim: true, sparse: true })
  google_subject?: string;

  @Prop({ required: true, trim: true })
  display_name: string;

  @Prop({ enum: AdminStatus, default: AdminStatus.ACTIVE, index: true })
  status: AdminStatus;

  @Prop({ trim: true, default: 'cli' })
  created_source: string;

  @Prop()
  last_login_at?: Date;

  created_at: Date;
  updated_at: Date;
}

export type AdminDocument = HydratedDocument<Admin>;
export const AdminSchema = SchemaFactory.createForClass(Admin);
AdminSchema.index({ email: 1 }, { unique: true });
AdminSchema.index(
  { google_subject: 1 },
  { unique: true, sparse: true, partialFilterExpression: { google_subject: { $type: 'string' } } },
);
