import { Global, Injectable, Logger, Module, OnModuleInit } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Interval } from '@nestjs/schedule';
import { Connection } from 'mongoose';
import { configureReliableCommands, deliverDurableEvent, recoverDisconnects } from './reliable-commands';
import { withRedisDelivery } from '../adapters/redis-delivery';
@Injectable()
class ReliableOutbox implements OnModuleInit {
  private busy = false;
  private readonly logger = new Logger(ReliableOutbox.name);
  constructor(@InjectConnection() private readonly db: Connection) {}
  async onModuleInit() {
    configureReliableCommands(this.db);
    await this.db.collection('game_commands').createIndex({ roomId: 1, actorId: 1, commandId: 1 }, { unique: true });
    await this.db.collection('game_outbox').createIndex({ published: 1, createdAt: 1, sequence: 1, index: 1 });
    await this.db.collection('game_outbox').createIndex({ roomId: 1, sequence: 1 });
    await this.db.collection('game_disconnects').createIndex({ completed: 1, checkedAt: 1, createdAt: 1 });
    if (process.env.RELIABLE_COMMANDS_ENABLED === 'true' || process.env.FINANCE_V2_ENABLED === 'true') {
      const hello = await this.db.db!.admin().command({ hello: 1 });
      if (!hello.setName && hello.msg !== 'isdbgrid') throw new Error('Financial/game transactions require a MongoDB replica set');
    }
  }
  @Interval(100)
  async publish() {
    if (this.busy || process.env.RELIABLE_COMMANDS_ENABLED !== 'true') return;
    this.busy = true;
    try {
      await recoverDisconnects();
      const events = await this.db.collection('game_outbox').find({ published: false }).sort({ createdAt: 1, sequence: 1, index: 1 }).limit(100).toArray();
      for (const item of events) {
        if (await withRedisDelivery(() => deliverDurableEvent(item.event))) await this.db.collection('game_outbox').updateOne({ _id: item._id },
          { $set: { published: true, publishedAt: new Date() } });
      }
    } catch { this.logger.error('event=game_outbox_publish_failed'); }
    finally { this.busy = false; }
  }
}
@Global()
@Module({ providers: [ReliableOutbox] })
export class ReliableCommandsModule {}
