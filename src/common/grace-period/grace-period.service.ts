import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { GracePeriod, GracePeriodDocument } from './grace-period.schema';

/**
 * Handler invoked when a grace period expires. Receives the player + room context;
 * the implementation typically calls the gateway's `eliminatePlayer` / `executeForfeit`.
 */
export type GracePeriodHandler = (playerId: string, roomId: string) => Promise<void>;

/**
 * Distributed grace-period manager. Replaces per-gateway `setTimeout` + Redis TTL pairs
 * with a Mongo-persisted deadline that survives pod restarts and a `@Cron(EVERY_SECOND)`
 * sweeper guarded by an atomic lock.
 *
 * Usage from a game gateway (e.g. `UnoGateway`):
 * ```
 * constructor(private readonly grace: GracePeriodService) {}
 * onModuleInit() {
 *   this.grace.registerHandler('uno', (pid, rid) => this.eliminatePlayer(rid, pid, 'forfeit'));
 * }
 * // On disconnect:
 * await this.grace.start('uno', player_id, room_id, ttlSec);
 * // On reconnect:
 * await this.grace.cancel('uno', player_id);
 * ```
 *
 * Multi-instance safety: every replica runs the sweep cron, but `findOneAndUpdate`
 * acquires an exclusive lock per row so each expiration fires exactly once. Handlers
 * are kept in-process; every replica that boots the gateway registers the same handler,
 * so any sweeper can dispatch.
 *
 * Minimum-grace policy: callers should use `Math.max(MIN_GRACE_SECS, remainingTurnSecs)`
 * so a mobile blip on the last second of a turn never falls below the product minimum
 * (currently 30 s).
 */
@Injectable()
export class GracePeriodService {
  private readonly logger = new Logger(GracePeriodService.name);
  private readonly handlers = new Map<string, GracePeriodHandler>();

  /** Minimum grace seconds (product policy). Callers MUST clamp to this floor. */
  static readonly MIN_GRACE_SECS = 30;

  constructor(
    @InjectModel(GracePeriod.name) private readonly graceModel: Model<GracePeriodDocument>,
  ) {}

  /** Register an expiration handler for a game. Idempotent — last call wins. */
  registerHandler(gameName: string, handler: GracePeriodHandler): void {
    this.handlers.set(gameName, handler);
  }

  /**
   * Open or refresh a grace period for `playerId` in `gameName`. If a row already exists
   * (e.g. player flapped offline twice), the deadline is bumped and `processing` reset.
   * Caller is responsible for clamping `ttlSec` to `MIN_GRACE_SECS`.
   */
  async start(gameName: string, playerId: string, roomId: string, ttlSec: number): Promise<void> {
    const clampedTtl = Math.max(GracePeriodService.MIN_GRACE_SECS, Math.ceil(ttlSec));
    const expiresAt = new Date(Date.now() + clampedTtl * 1000);
    try {
      await this.graceModel.findOneAndUpdate(
        { game_name: gameName, player_id: playerId },
        {
          $set: {
            room_id: roomId,
            expires_at: expiresAt,
            processing: false,
          },
        },
        { upsert: true },
      );
      this.logger.log(
        `event=grace_started game=${gameName} player=${playerId} room=${roomId} ttl=${clampedTtl}s`,
      );
    } catch (err) {
      this.logger.error(`[Grace] start failed | game=${gameName} player=${playerId}`, err);
    }
  }

  /** Cancel a grace period (e.g. player reconnected). No-op if none existed. */
  async cancel(gameName: string, playerId: string): Promise<void> {
    try {
      const result = await this.graceModel.deleteOne({ game_name: gameName, player_id: playerId });
      if (result?.deletedCount && result.deletedCount > 0) {
        this.logger.log(`event=grace_cancelled game=${gameName} player=${playerId}`);
      }
    } catch (err) {
      this.logger.error(`[Grace] cancel failed | game=${gameName} player=${playerId}`, err);
    }
  }

  /**
   * Sweeper. Runs every second on every replica; the atomic `findOneAndUpdate` ensures
   * each expired record is processed by exactly one replica. Processes up to
   * `BATCH_LIMIT` records per tick to keep the loop bounded.
   */
  @Cron(CronExpression.EVERY_SECOND)
  async sweep(): Promise<void> {
    const BATCH_LIMIT = 25;
    for (let i = 0; i < BATCH_LIMIT; i++) {
      let next: GracePeriodDocument | null = null;
      try {
        next = await this.graceModel.findOneAndUpdate(
          { expires_at: { $lte: new Date() }, processing: false },
          { $set: { processing: true } },
          { returnDocument: 'after' },
        );
      } catch (err) {
        this.logger.error('[Grace] sweep poll failed', err);
        return;
      }
      if (!next) return;

      const handler = this.handlers.get(next.game_name);
      if (!handler) {
        // Defensive: a row was created for a game whose handler isn't loaded here.
        // Release the lock so another replica (with the handler) can pick it up.
        await this.graceModel
          .updateOne({ _id: next._id }, { $set: { processing: false } })
          .catch(() => {});
        this.logger.warn(
          `[Grace] no handler registered for game=${next.game_name} — released lock`,
        );
        // Don't busy-loop on unhandled rows.
        return;
      }

      try {
        this.logger.log(
          `event=grace_expired game=${next.game_name} player=${next.player_id} room=${next.room_id}`,
        );
        await handler(next.player_id, next.room_id);
      } catch (err) {
        this.logger.error(
          `[Grace] handler failed | game=${next.game_name} player=${next.player_id}`,
          err,
        );
      }
      // Always remove the row — even on handler error — to avoid retrying a forfeit
      // that may have partially completed (idempotent forfeit logic in the gateway is
      // the right place to safeguard re-runs if we ever need them).
      await this.graceModel.deleteOne({ _id: next._id }).catch(() => {});
    }
  }
}
