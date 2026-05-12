import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type GracePeriodDocument = GracePeriod & Document;

/**
 * Distributed grace period record. One row per active disconnect across the whole
 * platform. A background sweeper (`GracePeriodService`) polls expired rows every
 * second and fires the registered handler for the matching `game_name`.
 *
 * Replaces the previous in-process `setTimeout` + Redis-TTL approach, which lost
 * grace timers on pod restart and led to stuck/forfeit-less matches.
 */
@Schema({ collection: 'grace_periods', timestamps: { createdAt: 'created_at', updatedAt: false } })
export class GracePeriod {
  /** Game identifier — `'uno' | 'chess' | 'halma' | 'domino' | 'naval-battle'`. */
  @Prop({ type: String, required: true, index: true })
  game_name: string;

  /** Disconnected player's user id (string form). */
  @Prop({ type: String, required: true, index: true })
  player_id: string;

  /** Room they were in when they disconnected, used to route the forfeit. */
  @Prop({ type: String, required: true })
  room_id: string;

  /** Deadline after which the sweeper triggers the registered handler. */
  @Prop({ type: Date, required: true })
  expires_at: Date;

  /**
   * Atomic lock used by the sweeper. The sweeper's `findOneAndUpdate` flips this to
   * `true` before invoking the handler so concurrent API replicas can't double-fire
   * a forfeit. The row is deleted right after the handler runs (success or failure).
   */
  @Prop({ type: Boolean, default: false })
  processing: boolean;
}

export const GracePeriodSchema = SchemaFactory.createForClass(GracePeriod);

// Compound unique — one open grace per (game, player). `start()` upserts on this key
// so a player who reconnects then disconnects again just refreshes the deadline.
GracePeriodSchema.index({ game_name: 1, player_id: 1 }, { unique: true });
// Sweep query path.
GracePeriodSchema.index({ expires_at: 1, processing: 1 });
