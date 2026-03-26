import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AppConfigDocument = AppConfig & Document;

@Schema({ versionKey: false, timestamps: false })
export class AppConfig {
  @Prop({ required: true, unique: true, default: 'global' }) key: string;
  @Prop({ required: true, default: 10000 }) withdrawal_daily_limit: number;
}

export const AppConfigSchema = SchemaFactory.createForClass(AppConfig);
