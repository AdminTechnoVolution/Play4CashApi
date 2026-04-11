import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type GreetingDocument = Greeting & Document;

@Schema({ _id: false })
export class GreetingText {
  @Prop() es: string;
  @Prop() en: string;
  @Prop() fr: string;
  @Prop() de: string;
  @Prop() it: string;
  @Prop() pt: string;
}

@Schema({ versionKey: false, timestamps: true })
export class Greeting {
  @Prop({ type: GreetingText, _id: false, required: true }) text: GreetingText;
  @Prop({ default: true }) active: boolean;
}

export const GreetingSchema = SchemaFactory.createForClass(Greeting);
