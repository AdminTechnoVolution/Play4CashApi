import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type GameDocument = Game & Document;

@Schema({ _id: false })
export class LanguageField {
  @Prop() es: string;
  @Prop() en: string;
  @Prop() fr: string;
  @Prop() de: string;
  @Prop() it: string;
  @Prop() pt: string;
}

@Schema()
export class Game {
  @Prop({ type: LanguageField, _id: false }) name: LanguageField;
  @Prop({ type: LanguageField, _id: false }) description: LanguageField;
  /** Localized bullet rules shown in the PWA catalog and lobby. */
  @Prop({ type: [{ type: LanguageField, _id: false }], default: [] })
  rules: LanguageField[];
  @Prop({ required: true }) active: boolean;
  @Prop({ required: true }) min_players: number;
  @Prop({ required: true }) max_players: number;
  @Prop({ required: true }) min_bet: number;
  @Prop({ type: [Number], required: true }) default_bets: number[];
  @Prop({ required: true, min: 1, max: 100 }) house_edge: number;
  @Prop({ required: true }) socket_code: string;
  @Prop({ required: true, min: 1 }) turn_timer_seconds: number;
  /**
   * UNO only: cumulative points needed to win the match for rooms of this game.
   * When unset, {@link UnoGateway} falls back to `UNO_MATCH_TARGET` env then 200.
   */
  @Prop({ required: false, min: 50, max: 500 })
  uno_match_target?: number;
  @Prop({ default: Date.now }) created_at: Date;
}

export const GameSchema = SchemaFactory.createForClass(Game);
