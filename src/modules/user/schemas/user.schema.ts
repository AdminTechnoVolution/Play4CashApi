import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

export enum UserStatus {
  PENDING_VERIFY = 'pending_verify',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
}

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
}

@Schema({ versionKey: false })
export class WalletAddress {
  @Prop({ uppercase: true })
  coin: string;

  @Prop({ uppercase: true, maxlength: 50 })
  network: string;

  @Prop()
  wallet: string;
}

@Schema({ versionKey: false })
export class User {
  @Prop({ required: true, unique: true })
  email: string;

  @Prop({ required: true, maxlength: 20 })
  username: string;

  @Prop({ type: WalletAddress, _id: false })
  wallet_address: WalletAddress;

  @Prop({ default: 0 })
  balance: number;

  @Prop({ default: 0 })
  total_recharged: number;

  @Prop({ default: 0 })
  total_witdrawal: number;

  @Prop({ default: 0 })
  total_won: number;

  @Prop({ default: Date.now })
  created_at: Date;

  @Prop({
    type: String,
    enum: Object.values(UserStatus),
    default: UserStatus.ACTIVE,
    lowercase: true,
  })
  status: UserStatus;

  @Prop({
    type: String,
    enum: Object.values(UserRole),
    default: UserRole.USER,
    lowercase: true,
  })
  role: UserRole;

  @Prop({ type: [{ endpoint: String, keys: { p256dh: String, auth: String } }], default: [] })
  push_subscriptions: Array<{ endpoint: string; keys: { p256dh: string; auth: string } }>;
}

export const UserSchema = SchemaFactory.createForClass(User);
UserSchema.index({ username: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
UserSchema.index({ status: 1 });
