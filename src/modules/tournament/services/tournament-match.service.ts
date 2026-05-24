import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'crypto';
import {
  TournamentMatch,
  TournamentMatchDocument,
} from '../schemas/tournament-match.schema';
import { Tournament, TournamentDocument } from '../schemas/tournament.schema';
import {
  TournamentParticipant,
  TournamentParticipantDocument,
} from '../schemas/tournament-participant.schema';
import { TournamentGroup, TournamentGroupDocument } from '../schemas/tournament-group.schema';
import { Room, RoomDocument } from '../../room/schemas/room.schema';
import { RoomStatus } from '../../room/schemas/room.schema';
import {
  TournamentMatchRoundName,
  TournamentMatchStatus,
  TournamentParticipantStatus,
  TournamentPhase,
  TournamentStatus,
  TOURNAMENT_GROUP_COUNT,
} from '../constants/tournament.constants';
import { pickLocalizedField } from '../tournament-language.util';
import { TournamentBracketService } from './tournament-bracket.service';
import { TournamentSettlementService } from './tournament-settlement.service';

@Injectable()
export class TournamentMatchService {
  private readonly logger = new Logger(TournamentMatchService.name);

  constructor(
    @InjectModel(TournamentMatch.name) private readonly matchModel: Model<TournamentMatchDocument>,
    @InjectModel(Tournament.name) private readonly tournamentModel: Model<TournamentDocument>,
    @InjectModel(TournamentParticipant.name)
    private readonly participantModel: Model<TournamentParticipantDocument>,
    @InjectModel(TournamentGroup.name) private readonly groupModel: Model<TournamentGroupDocument>,
    @InjectModel(Room.name) private readonly roomModel: Model<RoomDocument>,
    private readonly bracketService: TournamentBracketService,
    @Inject(forwardRef(() => TournamentSettlementService))
    private readonly settlement: TournamentSettlementService,
  ) {}

  async createTournamentRoom(
    tournament: TournamentDocument,
    match: TournamentMatchDocument,
  ): Promise<Types.ObjectId> {
    const code = randomBytes(8).toString('hex');
    const players: Array<{ playerId: Types.ObjectId; ready: boolean }> = [];
    if (match.player_a_user_id) {
      players.push({ playerId: match.player_a_user_id as Types.ObjectId, ready: true });
    }
    if (match.player_b_user_id) {
      players.push({ playerId: match.player_b_user_id as Types.ObjectId, ready: true });
    }

    const room = await this.roomModel.create({
      name: `Tournament ${pickLocalizedField(tournament.title, 'en')}`,
      code,
      game_id: tournament.game_id,
      players,
      bet_amount: 0,
      house_edge: 0,
      public: false,
      player_limit: 2,
      status: RoomStatus.WAITING,
      source: 'tournament',
      tournament_id: tournament._id,
      tournament_match_id: match._id,
      turn_timer_seconds: tournament.turn_timer_seconds,
    });

    match.room_id = room._id as Types.ObjectId;
    match.status = TournamentMatchStatus.READY;
    await match.save();
    return room._id as Types.ObjectId;
  }

  async advanceWinner(
    match: TournamentMatchDocument,
    winnerId: Types.ObjectId,
    reason: string,
  ): Promise<void> {
    if (match.status === TournamentMatchStatus.FINISHED || match.status === TournamentMatchStatus.FORFEITED) {
      return;
    }

    const loserId =
      match.player_a_user_id?.toString() === winnerId.toString()
        ? match.player_b_user_id
        : match.player_a_user_id;

    match.winner_user_id = winnerId;
    match.loser_user_id = loserId ?? undefined;
    match.status = reason.includes('forfeit') || reason === 'bye'
      ? TournamentMatchStatus.FORFEITED
      : TournamentMatchStatus.FINISHED;
    match.result_reason = reason;
    match.finished_at = new Date();
    await match.save();

    if (loserId && reason !== 'bye') {
      await this.participantModel.updateOne(
        { tournament_id: match.tournament_id, user_id: loserId },
        {
          $set: {
            status: TournamentParticipantStatus.ELIMINATED,
            eliminated_at: new Date(),
          },
        },
      );
    }

    if (match.next_match_id && match.next_slot) {
      const next = await this.matchModel.findById(match.next_match_id);
      if (next) {
        if (match.next_slot === 'A') next.player_a_user_id = winnerId;
        else next.player_b_user_id = winnerId;
        await next.save();
      }
    }

    await this.checkRoundComplete(match);
  }

  private async checkRoundComplete(completedMatch: TournamentMatchDocument): Promise<void> {
    const tournamentId = completedMatch.tournament_id as Types.ObjectId;
    const roundIndex = completedMatch.round_index;

    const pending = await this.matchModel.countDocuments({
      tournament_id: tournamentId,
      round_index: roundIndex,
      status: { $nin: [TournamentMatchStatus.FINISHED, TournamentMatchStatus.FORFEITED] },
    });
    if (pending > 0) return;

    const tournament = await this.tournamentModel.findById(tournamentId);
    if (!tournament) return;

    if (completedMatch.round_name === TournamentMatchRoundName.GRAND_FINAL) {
      await this.settlement.settle(tournament, completedMatch.winner_user_id!, completedMatch.loser_user_id!);
      return;
    }

    if (completedMatch.round_name === TournamentMatchRoundName.GROUP_FINAL) {
      await this.handleGroupFinalsComplete(tournament, roundIndex);
      return;
    }

    tournament.status = TournamentStatus.BETWEEN_ROUNDS;
    tournament.between_rounds_ends_at = new Date(
      Date.now() + tournament.between_rounds_pause_seconds * 1000,
    );
    await tournament.save();
  }

  private async handleGroupFinalsComplete(tournament: TournamentDocument, roundIndex: number): Promise<void> {
    const gfMatches = await this.matchModel.find({
      tournament_id: tournament._id,
      round_name: TournamentMatchRoundName.GROUP_FINAL,
      round_index: roundIndex,
    });

    for (const m of gfMatches) {
      if (!m.winner_user_id || !m.group_number) continue;
      await this.groupModel.updateOne(
        { tournament_id: tournament._id, group_number: m.group_number },
        { $set: { winner_user_id: m.winner_user_id, status: 'finished' } },
      );
      await this.participantModel.updateOne(
        { tournament_id: tournament._id, user_id: m.winner_user_id },
        { $set: { status: TournamentParticipantStatus.GROUP_WINNER } },
      );
    }

    const winners = await this.participantModel.countDocuments({
      tournament_id: tournament._id,
      status: TournamentParticipantStatus.GROUP_WINNER,
    });

    if (winners >= tournament.group_count) {
      await this.bracketService.generateFinalsBracket(tournament);
      tournament.status = TournamentStatus.FINALS_RUNNING;
      tournament.current_phase = TournamentPhase.FINALS;
      tournament.current_round_index = 1000;
      await tournament.save();
      return;
    }

    tournament.status = TournamentStatus.BETWEEN_ROUNDS;
    tournament.between_rounds_ends_at = new Date(
      Date.now() + tournament.between_rounds_pause_seconds * 1000,
    );
    await tournament.save();
  }

  async completeFromGameRoom(
    room: RoomDocument,
    result: { winnerId: string; loserId?: string; reason: string },
  ): Promise<void> {
    if (!room.tournament_match_id) return;
    const match = await this.matchModel.findById(room.tournament_match_id);
    if (!match) return;
    await this.advanceWinner(match, new Types.ObjectId(result.winnerId), result.reason);
  }

  async forfeitMatch(matchId: string, winnerId: string, reason: string): Promise<void> {
    const match = await this.matchModel.findById(matchId);
    if (!match) return;
    await this.advanceWinner(match, new Types.ObjectId(winnerId), reason);
  }

  async activateRoundMatches(tournament: TournamentDocument, roundIndex: number): Promise<void> {
    const matches = await this.matchModel.find({
      tournament_id: tournament._id,
      round_index: roundIndex,
      status: TournamentMatchStatus.PENDING,
    });

    for (const m of matches) {
      if (m.player_a_user_id && m.player_b_user_id) {
        m.status = TournamentMatchStatus.WAITING_PRESENCE;
        m.presence_check_at = new Date(Date.now() + tournament.presence_window_seconds * 1000);
        await m.save();
      } else if (m.player_a_user_id && !m.player_b_user_id) {
        await this.advanceWinner(m, m.player_a_user_id as Types.ObjectId, 'bye');
      } else if (!m.player_a_user_id && m.player_b_user_id) {
        await this.advanceWinner(m, m.player_b_user_id as Types.ObjectId, 'bye');
      }
    }

    tournament.current_round_index = roundIndex;
    tournament.status =
      tournament.current_phase === TournamentPhase.FINALS
        ? TournamentStatus.FINALS_RUNNING
        : TournamentStatus.RUNNING;
    await tournament.save();
  }
}
