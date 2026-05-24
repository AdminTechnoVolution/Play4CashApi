import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
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
import { TournamentStatus } from '../constants/tournament.constants';
import {
  pickLocalizedField,
  resolveRequestLang,
  toAdminTournamentRecord,
} from '../tournament-language.util';

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
  constructor(
    @InjectModel(Tournament.name) private readonly tournamentModel: Model<TournamentDocument>,
    @InjectModel(TournamentParticipant.name)
    private readonly participantModel: Model<TournamentParticipantDocument>,
    @InjectModel(TournamentGroup.name) private readonly groupModel: Model<TournamentGroupDocument>,
    @InjectModel(TournamentMatch.name) private readonly matchModel: Model<TournamentMatchDocument>,
  ) {}

  buildTimeProjection(t: TournamentDocument): TournamentTimeProjection {
    const now = Date.now();
    const startsMs = t.starts_at.getTime();
    let remainingMs = Math.max(0, startsMs - now);
    if (
      t.status === TournamentStatus.RUNNING ||
      t.status === TournamentStatus.FINALS_RUNNING ||
      t.status === TournamentStatus.LOCKING
    ) {
      remainingMs = 0;
    }
    let pauseRemainingMs: number | null = null;
    if (t.between_rounds_ends_at && t.status === TournamentStatus.BETWEEN_ROUNDS) {
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

  async toPublicDetail(t: TournamentDocument, userId?: string, langHeader?: string) {
    const lang = resolveRequestLang(langHeader);
    const time = this.buildTimeProjection(t);
    let myRegistration: {
      status: string;
      seed?: number;
      groupNumber?: number;
    } | null = null;
    if (userId) {
      const reg = await this.participantModel
        .findOne({ tournament_id: t._id, user_id: userId })
        .lean();
      if (reg) {
        myRegistration = {
          status: reg.status,
          seed: reg.seed,
          groupNumber: reg.group_number,
        };
      }
    }
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
        .findOne({ tournament_id: t._id, user_id: userId })
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
    const groups = await this.groupModel.find({ tournament_id: tournamentId }).sort({ group_number: 1 }).lean();
    const matches = await this.matchModel.find({ tournament_id: tournamentId }).sort({ round_index: 1, match_index: 1 }).lean();
    const participants = await this.participantModel.find({ tournament_id: tournamentId }).lean();
    const byUser = new Map(participants.map((p) => [p.user_id.toString(), p]));
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
      groups: groups.map((g) => ({
        groupNumber: g.group_number,
        status: g.status,
        winnerUserId: g.winner_user_id?.toString() ?? null,
      })),
      groupMatches: matches.filter((m) => m.phase === 'groups').map(mapMatch),
      finalsMatches: matches.filter((m) => m.phase === 'finals').map(mapMatch),
    };
  }

  async listVisible(): Promise<TournamentDocument[]> {
    return this.tournamentModel
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
            TournamentStatus.FINISHED,
          ],
        },
      })
      .sort({ starts_at: 1 })
      .exec();
  }
}
