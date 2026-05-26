import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TurnDeadline, TurnDeadlineDocument } from './turn-deadline.schema';

export type TurnDeadlineHandler = (playerId: string, roomId: string) => Promise<void>;

/**
 * Mongo-backed turn deadlines (grace-period pattern) so timeouts survive pod restarts
 * and work across replicas. Gateways still arm in-process timers for low latency;
 * this registry is the source of truth when the local timer is lost.
 */
@Injectable()
export class TurnDeadlineService {
  private readonly logger = new Logger(TurnDeadlineService.name);
  private readonly handlers = new Map<string, TurnDeadlineHandler>();

  constructor(
    @InjectModel(TurnDeadline.name) private readonly model: Model<TurnDeadlineDocument>,
  ) {}

  registerHandler(gameName: string, handler: TurnDeadlineHandler): void {
    this.handlers.set(gameName, handler);
  }

  async schedule(
    gameName: string,
    roomId: string,
    playerId: string,
    ttlSec: number,
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + Math.max(1, Math.ceil(ttlSec)) * 1000);
    await this.model.findOneAndUpdate(
      { game_name: gameName, room_id: roomId },
      { $set: { player_id: playerId, expires_at: expiresAt, processing: false } },
      { upsert: true },
    );
  }

  async cancel(gameName: string, roomId: string): Promise<void> {
    await this.model.deleteOne({ game_name: gameName, room_id: roomId });
  }

  @Cron(CronExpression.EVERY_SECOND)
  async sweep(): Promise<void> {
    const now = new Date();
    const due = await this.model
      .find({ expires_at: { $lte: now }, processing: false })
      .sort({ expires_at: 1 })
      .limit(25)
      .exec();

    for (const row of due) {
      const locked = await this.model.findOneAndUpdate(
        { _id: row._id, processing: false },
        { $set: { processing: true } },
        { new: true },
      );
      if (!locked) continue;

      const handler = this.handlers.get(row.game_name);
      try {
        if (handler) await handler(row.player_id, row.room_id);
      } catch (err) {
        this.logger.error(
          `event=turn_deadline_failed game=${row.game_name} room=${row.room_id}`,
          err,
        );
      } finally {
        await this.model.deleteOne({ _id: row._id });
      }
    }
  }
}
