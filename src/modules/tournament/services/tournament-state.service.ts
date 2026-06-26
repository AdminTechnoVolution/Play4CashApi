import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Tournament, TournamentDocument } from '../schemas/tournament.schema';
import {
  TournamentParticipant,
  TournamentParticipantDocument,
} from '../schemas/tournament-participant.schema';
import {
  TournamentGroup,
  TournamentGroupDocument,
} from '../schemas/tournament-group.schema';
import {
  TournamentMatch,
  TournamentMatchDocument,
} from '../schemas/tournament-match.schema';
import { Room, RoomDocument } from '../../room/schemas/room.schema';
import {
  pickLocalizedField,
  resolveRequestLang,
  toAdminTournamentRecord,
} from '../tournament-language.util';
import {
  TournamentMatchStatus,
  TournamentParticipantStatus,
  TournamentStatus,
} from '../constants/tournament.constants';
import { TtlCache } from '../../../common/ttl-cache';
import { logSlowEvent } from '../../../common/perf-log.util';

export interface TournamentTimeProjection {
  serverNow: string;
  startsAt: string;
  remainingMs: number;
  pauseRemainingMs: number | null;
  currentPhase: string;
  currentRoundIndex: number;
  status: string;
}

@Injectable()
export class TournamentStateService {
  private readonly logger = new Logger(TournamentStateService.name);
  private readonly visibleTournamentsCache = new TtlCache<TournamentDocument[]>();
  private readonly tournamentsForUserCache = new TtlCache<any[]>();

  constructor(
    @InjectModel(Tournament.name) private readonly tournamentModel: Model<TournamentDocument>,
    @InjectModel(TournamentParticipant.name)
    private readonly participantModel: Model<TournamentParticipantDocument>,
    @InjectModel(TournamentGroup.name) private readonly groupModel: Model<TournamentGroupDocument>,
    @InjectModel(TournamentMatch.name) private readonly matchModel: Model<TournamentMatchDocument>,
    @InjectModel(Room.name) private readonly roomModel: Model<RoomDocument>,
  ) {}

  buildTimeProjection(t: TournamentDocument): TournamentTimeProjection {
    const now = Date.now();
    const startsMs = t.starts_at.getTime();
    let remainingMs = Math.max(0, startsMs - now);
    if (
      t.status === TournamentStatus.RUNNING ||
      t.status === TournamentStatus.FINALS_RUNNING ||
      t.status === TournamentStatus.LOCKING ||
      t.status === TournamentStatus.BETWEEN_ROUNDS ||
      t.status === TournamentStatus.FINALS_PENDING
    ) {
      remainingMs = 0;
    }
    let pauseRemainingMs: number | null = null;
    if (
      t.between_rounds_ends_at &&
      (t.status === TournamentStatus.BETWEEN_ROUNDS || t.status === TournamentStatus.FINALS_PENDING)
    ) {
      pauseRemainingMs = Math.max(0, t.between_rounds_ends_at.getTime() - now);
    }
    return {
      serverNow: new Date(now).toISOString(),
      startsAt: t.starts_at.toISOString(),
      remainingMs,
      pauseRemainingMs,
      currentPhase: t.current_phase,
      currentRoundIndex: t.current_round_index,
      status: t.status,
    };
  }

  async resolveMyActiveMatch(tournamentId: Types.ObjectId, userId: string) {
    const startedAt = process.hrtime.bigint();
    const uid = new Types.ObjectId(userId);
    const reg = await this.participantModel
      .findOne({ tournament_id: tournamentId, user_id: uid })
      .select('status')
      .lean();
    if (!reg) {
      logSlowEvent(this.logger, 'tournament_active_match_trace', startedAt, 50, { found: false });
      return null;
    }
    const blocked = new Set<string>([
      TournamentParticipantStatus.ELIMINATED,
      TournamentParticipantStatus.FORFEITED,
      TournamentParticipantStatus.REFUNDED,
      TournamentParticipantStatus.RUNNER_UP,
      TournamentParticipantStatus.WINNER,
    ]);
    if (blocked.has(reg.status)) {
      logSlowEvent(this.logger, 'tournament_active_match_trace', startedAt, 50, {
        found: false,
        blocked: true,
      });
      return null;
    }

    const match = await this.matchModel
      .findOne({
        tournament_id: tournamentId,
        $or: [{ player_a_user_id: uid }, { player_b_user_id: uid }],
        status: {
          $in: [
            TournamentMatchStatus.WAITING_PRESENCE,
            TournamentMatchStatus.READY,
            TournamentMatchStatus.STARTED,
          ],
        },
      })
      .sort({ round_index: -1, match_index: 1 })
      .lean();

    if (!match) {
      logSlowEvent(this.logger, 'tournament_active_match_trace', startedAt, 50, { found: false });
      return null;
    }

    const opponentId =
      match.player_a_user_id?.toString() === userId
        ? match.player_b_user_id
        : match.player_a_user_id;
    const roomId = match.room_id?.toString() ?? null;
    const status = match.status;
    const [opponent, room] = await Promise.all([
      opponentId
        ? this.participantModel
            .findOne({ tournament_id: tournamentId, user_id: opponentId })
            .select('username')
            .lean()
        : Promise.resolve(null),
      roomId ? this.roomModel.findById(roomId).select('status').lean() : Promise.resolve(null),
    ]);

    if (roomId && (!room || room.status === 'finished')) {
      logSlowEvent(this.logger, 'tournament_active_match_trace', startedAt, 50, {
        found: false,
        room_finished: true,
      });
      return null;
    }

    logSlowEvent(this.logger, 'tournament_active_match_trace', startedAt, 50, { found: true });
    return {
      matchId: match._id.toString(),
      status,
      roomId,
      roundName: match.round_name,
      opponentUsername: opponent?.username ?? null,
      presenceCheckAt: match.presence_check_at?.toISOString() ?? null,
      canJoin: !!roomId && (status === TournamentMatchStatus.READY || status === TournamentMatchStatus.STARTED),
      needsLobby: status === TournamentMatchStatus.WAITING_PRESENCE,
    };
  }

  async toPublicDetail(t: TournamentDocument, userId?: string, langHeader?: string) {
    const startedAt = process.hrtime.bigint();
    const lang = resolveRequestLang(langHeader);
    const time = this.buildTimeProjection(t);
    let myRegistration: {
      status: string;
      seed?: number;
      groupNumber?: number;
    } | null = null;
    let myActiveMatch: Awaited<ReturnType<TournamentStateService['resolveMyActiveMatch']>> = null;
    if (userId) {
      const [reg, activeMatch] = await Promise.all([
        this.participantModel.findOne({ tournament_id: t._id, user_id: new Types.ObjectId(userId) }).lean(),
        this.resolveMyActiveMatch(t._id as Types.ObjectId, userId),
      ]);
      if (reg) {
        myRegistration = {
          status: reg.status,
          seed: reg.seed,
          groupNumber: reg.group_number,
        };
      }
      myActiveMatch = activeMatch;
    }
    logSlowEvent(this.logger, 'tournament_detail_trace', startedAt, 75, {
      hasRegistration: !!myRegistration,
      hasActiveMatch: !!myActiveMatch,
    });
    return {
      id: t._id.toString(),
      title: pickLocalizedField(t.title, lang),
      description: pickLocalizedField(t.description, lang),
      gameSocketCode: t.game_socket_code,
      gameId: t.game_id.toString(),
      buyIn: t.buy_in,
      maxPlayers: t.max_players,
      minPlayers: t.min_players,
      registeredCount: t.registered_count,
      groupCount: t.group_count,
      turnTimerSeconds: t.turn_timer_seconds,
      betweenRoundsPauseSeconds: t.between_rounds_pause_seconds,
      houseFeePercent: t.house_fee_percent,
      firstPlacePercent: t.first_place_percent,
      secondPlacePercent: t.second_place_percent,
      grossPrizePool: t.gross_prize_pool,
      firstPlaceAmount: t.first_place_amount,
      secondPlaceAmount: t.second_place_amount,
      winnerUserId: t.winner_user_id?.toString() ?? null,
      runnerUpUserId: t.runner_up_user_id?.toString() ?? null,
      myRegistration,
      myActiveMatch,
      ...time,
    };
  }

  async toAdminDetail(t: TournamentDocument, userId?: string) {
    const base = toAdminTournamentRecord(t);
    let myRegistration: {
      status: string;
      seed?: number;
      groupNumber?: number;
    } | null = null;
    if (userId) {
      const reg = await this.participantModel
        .findOne({ tournament_id: t._id, user_id: new Types.ObjectId(userId) })
        .lean();
      if (reg) {
        myRegistration = {
          status: reg.status,
          seed: reg.seed,
          groupNumber: reg.group_number,
        };
      }
    }
    const time = this.buildTimeProjection(t);
    return {
      ...base,
      myRegistration,
      serverNow: time.serverNow,
      remainingMs: time.remainingMs,
      pauseRemainingMs: time.pauseRemainingMs,
    };
  }

  async getBracket(tournamentId: string) {
    if (!Types.ObjectId.isValid(tournamentId)) {
      throw new NotFoundException('Tournament not found');
    }
    const oid = new Types.ObjectId(tournamentId);
    const tournament = await this.tournamentModel.findById(oid).select('_id group_count').lean();
    if (!tournament) {
      throw new NotFoundException('Tournament not found');
    }

    const groupsFromDb = await this.groupModel.find({ tournament_id: oid }).sort({ group_number: 1 }).lean();
    const matches = await this.matchModel.find({ tournament_id: oid }).sort({ round_index: 1, match_index: 1 }).lean();
    const participants = await this.participantModel
      .find({
        tournament_id: oid,
        status: { $ne: TournamentParticipantStatus.REFUNDED },
      })
      .sort({ seed: 1 })
      .lean();

    const byUser = new Map(participants.map((p) => [p.user_id.toString(), p]));

    const rosterByGroup = new Map<
      number,
      Array<{ userId: string; username: string; seed?: number; status: string }>
    >();
    for (const p of participants) {
      const gn = p.group_number;
      if (!gn) continue;
      if (!rosterByGroup.has(gn)) rosterByGroup.set(gn, []);
      rosterByGroup.get(gn)!.push({
        userId: p.user_id.toString(),
        username: p.username,
        seed: p.seed,
        status: p.status,
      });
    }

    const mapParticipantList = (groupNumber: number) => rosterByGroup.get(groupNumber) ?? [];

    const groups =
      groupsFromDb.length > 0
        ? groupsFromDb.map((g) => ({
            groupNumber: g.group_number,
            status: g.status,
            winnerUserId: g.winner_user_id?.toString() ?? null,
            participants: mapParticipantList(g.group_number),
          }))
        : Array.from({ length: tournament.group_count }, (_, i) => {
            const groupNumber = i + 1;
            return {
              groupNumber,
              status: 'pending',
              winnerUserId: null as string | null,
              participants: mapParticipantList(groupNumber),
            };
          });

    const mapMatch = (m: typeof matches[0]) => ({
      id: m._id.toString(),
      groupNumber: m.group_number ?? null,
      phase: m.phase,
      roundName: m.round_name,
      roundIndex: m.round_index,
      matchIndex: m.match_index,
      status: m.status,
      playerA: m.player_a_user_id
        ? { userId: m.player_a_user_id.toString(), username: byUser.get(m.player_a_user_id.toString())?.username ?? '' }
        : null,
      playerB: m.player_b_user_id
        ? { userId: m.player_b_user_id.toString(), username: byUser.get(m.player_b_user_id.toString())?.username ?? '' }
        : null,
      winnerUserId: m.winner_user_id?.toString() ?? null,
      roomId: m.room_id?.toString() ?? null,
      isBye: m.is_bye,
    });
    return {
      groups,
      groupMatches: matches.filter((m) => m.phase === 'groups').map(mapMatch),
      finalsMatches: matches.filter((m) => m.phase === 'finals').map(mapMatch),
    };
  }

  async listForUser(userId: string, langHeader?: string) {
    const startedAt = process.hrtime.bigint();
    const cacheKey = `mine:${userId}:${resolveRequestLang(langHeader)}`;
    const data = await this.tournamentsForUserCache.getOrSet(cacheKey, 5_000, async () => {
      const parts = await this.participantModel
        .find({
          user_id: new Types.ObjectId(userId),
          status: { $nin: [TournamentParticipantStatus.REFUNDED] },
        })
        .lean();
      if (parts.length === 0) return [];

      const ids = parts.map((p) => p.tournament_id);
      const tournaments = await this.tournamentModel
        .find({
          _id: { $in: ids },
          status: {
            $nin: [
              TournamentStatus.DRAFT,
              TournamentStatus.CANCELLED,
              TournamentStatus.FINISHED,
            ],
          },
        })
        .sort({ starts_at: 1 })
        .exec();

      return Promise.all(tournaments.map((t) => this.toPublicDetail(t, userId, langHeader)));
    });
    logSlowEvent(this.logger, 'tournament_mine_trace', startedAt, 50, { row_count: data.length });
    return data;
  }

  async listHistoryForUser(userId: string, langHeader?: string) {
    const lang = resolveRequestLang(langHeader);
    const uid = new Types.ObjectId(userId);
    const parts = await this.participantModel
      .find({ user_id: uid })
      .sort({ registered_at: -1 })
      .lean();
    if (parts.length === 0) return [];

    const partByTournament = new Map(parts.map((p) => [p.tournament_id.toString(), p]));
    const tournamentIds = parts.map((p) => p.tournament_id);

    const tournaments = await this.tournamentModel
      .find({
        _id: { $in: tournamentIds },
        status: { $in: [TournamentStatus.FINISHED, TournamentStatus.CANCELLED] },
      })
      .sort({ finished_at: -1, starts_at: -1 })
      .lean();

    return tournaments
      .map((t) => {
        const p = partByTournament.get(t._id.toString());
        if (!p) return null;

        const { first, second } = this.resolvePlaceAmounts(t);
        let prizeAmount = 0;
        if (p.status === TournamentParticipantStatus.WINNER) {
          prizeAmount = first;
        } else if (p.status === TournamentParticipantStatus.RUNNER_UP) {
          prizeAmount = second;
        } else if (
          t.status === TournamentStatus.CANCELLED &&
          p.status !== TournamentParticipantStatus.REFUNDED
        ) {
          prizeAmount = t.buy_in;
        }

        return {
          id: t._id.toString(),
          title: pickLocalizedField(t.title, lang),
          gameSocketCode: t.game_socket_code,
          status: t.status,
          buyIn: t.buy_in,
          maxPlayers: t.max_players,
          registeredCount: t.registered_count,
          grossPrizePool: t.gross_prize_pool,
          houseFeePercent: t.house_fee_percent,
          firstPlacePercent: t.first_place_percent,
          firstPlaceAmount: t.first_place_amount,
          secondPlaceAmount: t.second_place_amount,
          participantStatus: p.status,
          finalRank: p.final_rank ?? null,
          prizeAmount,
          finishedAt: t.finished_at?.toISOString() ?? null,
          startedAt: t.starts_at.toISOString(),
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null);
  }

  private resolvePlaceAmounts(
    t: Pick<
      TournamentDocument,
      | 'gross_prize_pool'
      | 'house_fee_percent'
      | 'first_place_percent'
      | 'first_place_amount'
      | 'second_place_amount'
    >,
  ): { first: number; second: number } {
    if (t.first_place_amount > 0 || t.second_place_amount > 0) {
      return { first: t.first_place_amount, second: t.second_place_amount };
    }
    const gross = t.gross_prize_pool ?? 0;
    const house = Math.round(gross * (t.house_fee_percent / 100) * 100) / 100;
    const first = Math.round(gross * (t.first_place_percent / 100) * 100) / 100;
    const second = Math.round(Math.max(0, gross - house - first) * 100) / 100;
    return { first, second };
  }

  async listVisible(): Promise<TournamentDocument[]> {
    const startedAt = process.hrtime.bigint();
    const data = await this.visibleTournamentsCache.getOrSet('visible', 5_000, async () =>
      this.tournamentModel
        .find({
          status: {
            $in: [
              TournamentStatus.OPEN,
              TournamentStatus.FULL,
              TournamentStatus.COUNTDOWN,
              TournamentStatus.RUNNING,
              TournamentStatus.BETWEEN_ROUNDS,
              TournamentStatus.FINALS_PENDING,
              TournamentStatus.FINALS_RUNNING,
            ],
          },
        })
        .sort({ starts_at: 1 })
        .exec(),
    );
    logSlowEvent(this.logger, 'tournament_visible_trace', startedAt, 25, { row_count: data.length });
    return data;
  }
}
