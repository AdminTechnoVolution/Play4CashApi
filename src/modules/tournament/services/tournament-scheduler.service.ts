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
  TournamentPhase,
  TournamentStatus,
} from '../constants/tournament.constants';
import { TournamentBracketService } from './tournament-bracket.service';
import { TournamentMatchService } from './tournament-match.service';
import { TournamentLedgerService } from './tournament-ledger.service';
import { TournamentsGateway } from '../../websockets/tournaments/tournaments.gateway';
import { Room, RoomDocument } from '../../room/schemas/room.schema';
import { RoomStatus } from '../../room/schemas/room.schema';

@Injectable()
export class TournamentSchedulerService {
  private readonly logger = new Logger(TournamentSchedulerService.name);

  constructor(
    @InjectModel(Tournament.name) private readonly tournamentModel: Model<TournamentDocument>,
    @InjectModel(TournamentParticipant.name)
    private readonly participantModel: Model<TournamentParticipantDocument>,
    @InjectModel(TournamentMatch.name) private readonly matchModel: Model<TournamentMatchDocument>,
    @InjectModel(Room.name) private readonly roomModel: Model<RoomDocument>,
    private readonly bracketService: TournamentBracketService,
    private readonly matchService: TournamentMatchService,
    private readonly ledger: TournamentLedgerService,
    @Inject(REDIS_CLIENT) private readonly redis: any,
    private readonly tournamentsGateway: TournamentsGateway,
  ) {}

  @Cron(CronExpression.EVERY_SECOND)
  async tick(): Promise<void> {
    await this.processStartTimes();
    await this.processBetweenRounds();
    await this.repairStuckMatchesFromFinishedRooms();
    await this.repairBrokenMatchRooms();
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
        void this.tournamentsGateway.emitMatchUpdate(fresh._id.toString());
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
        } else {
          const maxGroupRound = await this.matchModel
            .findOne({ tournament_id: fresh._id, phase: TournamentPhase.GROUPS })
            .sort({ round_index: -1 })
            .select('round_index')
            .lean();
          const cap = maxGroupRound?.round_index ?? 0;
          if (nextRound <= cap) {
            await this.matchService.activateRoundMatches(fresh, nextRound);
          }
        }
        fresh.between_rounds_ends_at = undefined;
        await fresh.save();
        void this.tournamentsGateway.emitMatchUpdate(fresh._id.toString());
      });
    }
  }

  /** Advance tournament matches whose game room already finished but match doc is still open. */
  private async repairStuckMatchesFromFinishedRooms(): Promise<void> {
    const stuck = await this.matchModel.find({
      status: {
        $in: [
          TournamentMatchStatus.WAITING_PRESENCE,
          TournamentMatchStatus.READY,
          TournamentMatchStatus.STARTED,
        ],
      },
      room_id: { $exists: true, $ne: null },
    });

    for (const m of stuck) {
      const tid = m.tournament_id.toString();
      await this.withLock(`stuck:${tid}:${m._id.toString()}`, async () => {
        const freshMatch = await this.matchModel.findById(m._id);
        if (!freshMatch?.room_id) return;
        if (
          freshMatch.status === TournamentMatchStatus.FINISHED ||
          freshMatch.status === TournamentMatchStatus.FORFEITED
        ) {
          return;
        }

        const room = await this.roomModel.findById(freshMatch.room_id);
        if (!room || room.status !== RoomStatus.FINISHED || !room.winner) return;

        const winnerId = room.winner.toString();
        const loserId = room.players
          ?.find((p) => p.playerId.toString() !== winnerId)
          ?.playerId?.toString();
        const reason = room.winner_reason ?? 'normal';

        await this.matchService.completeFromGameRoom(room, {
          winnerId,
          loserId,
          reason,
        });

        this.logger.log(
          `event=tournament_match_repaired_from_room matchId=${freshMatch._id.toString()} roomId=${room._id.toString()} winnerId=${winnerId}`,
        );
        void this.tournamentsGateway.emitMatchUpdate(tid);
      });
    }
  }

  /** Heal matches whose room_id is missing or points at a deleted/finished room. */
  private async repairBrokenMatchRooms(): Promise<void> {
    const active = await this.matchModel.find({
      status: {
        $in: [
          TournamentMatchStatus.WAITING_PRESENCE,
          TournamentMatchStatus.READY,
          TournamentMatchStatus.STARTED,
        ],
      },
      player_a_user_id: { $exists: true, $ne: null },
      player_b_user_id: { $exists: true, $ne: null },
    });

    for (const m of active) {
      const tid = m.tournament_id.toString();
      await this.withLock(`repair:${tid}:${m._id.toString()}`, async () => {
        const freshMatch = await this.matchModel.findById(m._id);
        if (!freshMatch) return;

        const tournament = await this.tournamentModel.findById(freshMatch.tournament_id);
        if (!tournament) return;
        if (
          tournament.status === TournamentStatus.FINISHED ||
          tournament.status === TournamentStatus.CANCELLED
        ) {
          return;
        }

        const beforeRoomId = freshMatch.room_id?.toString() ?? null;
        const roomId = await this.matchService.ensureRoomForMatch(tournament, freshMatch);
        const afterRoomId = roomId?.toString() ?? null;

        if (afterRoomId && afterRoomId !== beforeRoomId) {
          this.logger.log(
            `event=tournament_room_repaired matchId=${freshMatch._id.toString()} roomId=${afterRoomId}`,
          );
          void this.tournamentsGateway.emitMatchUpdate(tid);
        }
      });
    }
  }
}
