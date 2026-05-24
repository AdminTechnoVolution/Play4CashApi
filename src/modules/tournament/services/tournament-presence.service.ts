import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { REDIS_CLIENT } from '../../../common/redis/redis.module';

const PRESENCE_TTL_SEC = 45;

@Injectable()
export class TournamentPresenceService {
  private readonly logger = new Logger(TournamentPresenceService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: any) {}

  private key(tournamentId: string, userId: string): string {
    return `tournament:presence:${tournamentId}:${userId}`;
  }

  async markPresent(tournamentId: string, userId: string): Promise<void> {
    try {
      await this.redis.set(this.key(tournamentId, userId), '1', 'EX', PRESENCE_TTL_SEC);
    } catch (e) {
      this.logger.warn(`event=tournament_presence_set_failed err=${(e as Error).message}`);
    }
  }

  async isPresent(tournamentId: string, userId: string): Promise<boolean> {
    try {
      const v = await this.redis.get(this.key(tournamentId, userId));
      return v === '1';
    } catch {
      return false;
    }
  }

  async clear(tournamentId: string, userId: string): Promise<void> {
    try {
      await this.redis.del(this.key(tournamentId, userId));
    } catch {
      /* ignore */
    }
  }
}
