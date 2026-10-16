import { deferTransactionWrite } from '../reliable-commands/context';
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
    if (deferTransactionWrite(() => this.schedule(gameName, roomId, playerId, ttlSec))) return;
    const expiresAt = new Date(Date.now() + Math.max(1, Math.ceil(ttlSec)) * 1000);
    await this.model.findOneAndUpdate(
      { game_name: gameName, room_id: roomId },
      { $set: { player_id: playerId, expires_at: expiresAt, processing: false } },
      { upsert: true },
    );
  }

  async cancel(gameName: string, roomId: string): Promise<void> {
    if (deferTransactionWrite(() => this.cancel(gameName, roomId))) return;
    await this.model.deleteOne({ game_name: gameName, room_id: roomId });
  }

  @Cron(CronExpression.EVERY_SECOND)
  async sweep(): Promise<void> {
    const now = new Date();
    const due = await this.model
      .find({ expires_at: { $lte: now }, $or: [{ processing: false }, { processing: true, processing_at: { $lte: new Date(Date.now() - 30000) } }] })
      .sort({ expires_at: 1 })
      .limit(25)
      .exec();

    for (const row of due) {
      const locked = await this.model.findOneAndUpdate(
        { _id: row._id, expires_at: row.expires_at, $or: [{ processing: false }, { processing: true, processing_at: { $lte: new Date(Date.now() - 30000) } }] },
        { $set: { processing: true, processing_at: new Date() } },
        { new: true },
      );
      if (!locked) continue;

      const handler = this.handlers.get(row.game_name);
      let succeeded = false;
      try {
        if (handler) { await handler(row.player_id, row.room_id); succeeded = true; }
      } catch (err) {
        this.logger.error(
          `event=turn_deadline_failed game=${row.game_name} room=${row.room_id}`,
          err,
        );
      } finally {
        const held = { _id: row._id, processing: true, expires_at: row.expires_at, processing_at: locked.processing_at };
        if (succeeded) await this.model.deleteOne(held);
        else await this.model.updateOne(held, { $set: { processing: false, expires_at: new Date(Date.now() + 5000) } });
      }
    }
  }
}
