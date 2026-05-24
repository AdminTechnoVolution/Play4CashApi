import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { REDIS_CLIENT } from '../../../common/redis/redis.module';
import { Tournament, TournamentDocument } from '../schemas/tournament.schema';
import {
  TournamentParticipant,
  TournamentParticipantDocument,
} from '../schemas/tournament-participant.schema';
import {
  TournamentMatch,
  TournamentMatchDocument,
} from '../schemas/tournament-match.schema';
import {
  TournamentMatchStatus,
  TournamentStatus,
} from '../constants/tournament.constants';
import { TournamentBracketService } from './tournament-bracket.service';
import { TournamentMatchService } from './tournament-match.service';
import { TournamentPresenceService } from './tournament-presence.service';
import { TournamentLedgerService } from './tournament-ledger.service';

@Injectable()
export class TournamentSchedulerService {
  private readonly logger = new Logger(TournamentSchedulerService.name);

  constructor(
    @InjectModel(Tournament.name) private readonly tournamentModel: Model<TournamentDocument>,
    @InjectModel(TournamentParticipant.name)
    private readonly participantModel: Model<TournamentParticipantDocument>,
    @InjectModel(TournamentMatch.name) private readonly matchModel: Model<TournamentMatchDocument>,
    private readonly bracketService: TournamentBracketService,
    private readonly matchService: TournamentMatchService,
    private readonly presenceService: TournamentPresenceService,
    private readonly ledger: TournamentLedgerService,
    @Inject(REDIS_CLIENT) private readonly redis: any,
  ) {}

  @Cron(CronExpression.EVERY_SECOND)
  async tick(): Promise<void> {
    await this.processStartTimes();
    await this.processBetweenRounds();
    await this.processPresenceChecks();
  }

  private async withLock(tournamentId: string, fn: () => Promise<void>): Promise<void> {
    const lockKey = `job:tournament-scheduler:${tournamentId}`;
    const acquired = await this.redis.set(lockKey, '1', 'EX', 2, 'NX');
    if (!acquired) return;
    try {
      await fn();
    } finally {
      await this.redis.del(lockKey).catch(() => {});
    }
  }

  private async processStartTimes(): Promise<void> {
    const now = new Date();
    const due = await this.tournamentModel.find({
      status: { $in: [TournamentStatus.OPEN, TournamentStatus.FULL, TournamentStatus.COUNTDOWN] },
      starts_at: { $lte: now },
    });

    for (const t of due) {
      await this.withLock(t._id.toString(), async () => {
        const fresh = await this.tournamentModel.findById(t._id);
        if (!fresh || fresh.status === TournamentStatus.LOCKING) return;

        fresh.status = TournamentStatus.LOCKING;
        await fresh.save();

        if (fresh.registered_count < fresh.min_players) {
          fresh.status = TournamentStatus.CANCELLED;
          await fresh.save();
          const parts = await this.participantModel.find({ tournament_id: fresh._id });
          await this.ledger.refundAllRegistered(
            fresh._id as any,
            parts.map((p) => ({ user_id: p.user_id as any, amount: fresh.buy_in })),
          );
          return;
        }

        await this.bracketService.generateGroupsAndBrackets(fresh);
        fresh.status = TournamentStatus.RUNNING;
        fresh.current_round_index = 0;
        await fresh.save();
        await this.matchService.activateRoundMatches(fresh, 0);
      });
    }
  }

  private async processBetweenRounds(): Promise<void> {
    const now = new Date();
    const paused = await this.tournamentModel.find({
      status: TournamentStatus.BETWEEN_ROUNDS,
      between_rounds_ends_at: { $lte: now },
    });

    for (const t of paused) {
      await this.withLock(t._id.toString(), async () => {
        const fresh = await this.tournamentModel.findById(t._id);
        if (!fresh || fresh.status !== TournamentStatus.BETWEEN_ROUNDS) return;

        const nextRound = fresh.current_round_index + 1;
        if (fresh.current_phase === 'finals') {
          await this.matchService.activateRoundMatches(fresh, nextRound);
        } else if (nextRound <= 3) {
          await this.matchService.activateRoundMatches(fresh, nextRound);
        }
        fresh.between_rounds_ends_at = undefined;
        await fresh.save();
      });
    }
  }

  private async processPresenceChecks(): Promise<void> {
    const now = new Date();
    const due = await this.matchModel.find({
      status: TournamentMatchStatus.WAITING_PRESENCE,
      presence_check_at: { $lte: now },
    });

    for (const m of due) {
      const tid = m.tournament_id.toString();
      const playerA = m.player_a_user_id?.toString();
      const playerB = m.player_b_user_id?.toString();
      if (!playerA || !playerB) continue;

      const aPresent = await this.presenceService.isPresent(tid, playerA);
      const bPresent = await this.presenceService.isPresent(tid, playerB);

      if (aPresent && bPresent) {
        const tournament = await this.tournamentModel.findById(m.tournament_id);
        if (tournament) {
          await this.matchService.createTournamentRoom(tournament, m);
          m.status = TournamentMatchStatus.STARTED;
          m.started_at = new Date();
          await m.save();
        }
      } else if (aPresent && !bPresent) {
        await this.matchService.forfeitMatch(m._id.toString(), playerA, 'forfeit_absent_start');
      } else if (!aPresent && bPresent) {
        await this.matchService.forfeitMatch(m._id.toString(), playerB, 'forfeit_absent_start');
      } else {
        await this.matchService.forfeitMatch(m._id.toString(), playerA, 'forfeit_absent_start');
      }
    }
  }
}
