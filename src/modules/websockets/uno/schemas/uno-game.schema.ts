import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type UnoGameDocument = UnoGame & Document;

@Schema({ versionKey: '__v', timestamps: true, optimisticConcurrency: true })
export class UnoGame {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Room', required: true, unique: true })
  room_id: Types.ObjectId;

  @Prop([{ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true }])
  player_ids: Types.ObjectId[];

  /** Per-player hole cards; keys are user id strings */
  @Prop({ type: Map, of: [String], required: true })
  hands: Map<string, string[]>;

  /** Top of pile = index 0 (draw with shift) */
  @Prop({ type: [String], default: [] })
  draw_pile: string[];

  /** Top discard = last element */
  @Prop({ type: [String], default: [] })
  discard_pile: string[];

  @Prop({ type: Number, default: 0 })
  current_player_index: number;

  @Prop({ type: Number, enum: [1, -1], default: 1 })
  direction: number;

  /** Active color to match (R | G | B | Y) */
  @Prop({ type: String, required: true })
  current_color: string;

  /**
   * Pending +2/+4 the current player must take. 0 / 2 / 4 only — stacking is disabled
   * by product decision, so this never grows beyond a single card's worth.
   */
  @Prop({ type: Number, default: 0 })
  draw_stack_pending: number;

  @Prop({ type: [String], default: [] })
  eliminated_players: string[];

  @Prop({ type: Date, default: Date.now })
  turn_start_time: Date;

  /** Players who currently hold valid UNO declaration (1 card + called). */
  @Prop({ type: [String], default: [] })
  uno_called: string[];

  /**
   * Player who emptied to 1 card without declaring UNO. Any active player can challenge
   * them via `challenge_uno_miss` until the next state-mutating event closes the window.
   */
  @Prop({ type: String, default: null })
  pending_uno_offender: string | null;

  /** Last player who played, drew, took stack, or passed. Drives PWA toast hints. */
  @Prop({ type: String, default: null })
  last_action_player_id: string | null;

  // ── Multi-round (Phase 2) ────────────────────────────────────────────────

  /** Cumulative score per player across rounds in this match. Keys are user-id strings. */
  @Prop({ type: Map, of: Number, default: {} })
  match_scores: Map<string, number>;

  /** 1-indexed round counter — incremented every time a new hand is dealt. */
  @Prop({ type: Number, default: 1 })
  round_number: number;

  /**
   * Score required to win the whole match (Mattel: 500, we use 200 by default for mobile
   * pacing). Locked at room creation; cannot change mid-match.
   */
  @Prop({ type: Number, default: 200 })
  match_target_score: number;

  /** Once any player reaches `match_target_score`, this is set and the room finishes. */
  @Prop({ type: String, default: null })
  match_winner_id: string | null;

  /**
   * True when a round has ended but the match continues — clients render a scoreboard
   * with a countdown until the next deal. False during play and after match end.
   */
  @Prop({ type: Boolean, default: false })
  between_rounds: boolean;

  /** Server-side deadline for auto-starting the next round. */
  @Prop({ type: Date, default: null })
  next_round_starts_at: Date | null;

  /**
   * Atomic lock used by `UnoMatchScheduler`. The scheduler's `findOneAndUpdate` flips
   * this to `true` before processing a between-rounds timeout, so concurrent API
   * replicas can't double-fire the next-round deal. Cleared back to `false` once the
   * new hand is dealt (or if processing failed).
   */
  @Prop({ type: Boolean, default: false })
  between_rounds_processing: boolean;

  /**
   * Players who tapped "ready" between rounds. When all non-eliminated players are
   * present here, the next round starts immediately (without waiting on the timer).
   */
  @Prop({ type: [String], default: [] })
  players_ready_for_next: string[];

  /** Audit log: every completed round, used by the PWA scoreboard panel. */
  @Prop({
    type: [
      {
        round: { type: Number, required: true },
        winnerId: { type: String, required: true },
        scoreDealt: { type: Number, required: true },
        endedAt: { type: Date, default: Date.now },
      },
    ],
    default: [],
  })
  round_history: { round: number; winnerId: string; scoreDealt: number; endedAt: Date }[];
}

export const UnoGameSchema = SchemaFactory.createForClass(UnoGame);
