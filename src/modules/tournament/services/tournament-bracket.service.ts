import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHash } from 'crypto';
import { Tournament, TournamentDocument } from '../schemas/tournament.schema';
import {
  TournamentParticipant,
  TournamentParticipantDocument,
} from '../schemas/tournament-participant.schema';
import { TournamentGroup, TournamentGroupDocument } from '../schemas/tournament-group.schema';
import {
  TournamentMatch,
  TournamentMatchDocument,
} from '../schemas/tournament-match.schema';
import {
  TournamentMatchRoundName,
  TournamentMatchStatus,
  TournamentParticipantStatus,
  TournamentPhase,
  TOURNAMENT_GROUP_COUNT,
} from '../constants/tournament.constants';

interface BracketMatchDef {
  phase: TournamentPhase;
  groupNumber?: number;
  roundName: TournamentMatchRoundName;
  roundIndex: number;
  matchIndex: number;
  playerA?: Types.ObjectId;
  playerB?: Types.ObjectId;
  isBye?: boolean;
  nextRef?: { roundIndex: number; matchIndex: number; slot: 'A' | 'B' };
}

@Injectable()
export class TournamentBracketService {
  private readonly logger = new Logger(TournamentBracketService.name);

  constructor(
    @InjectModel(Tournament.name) private readonly tournamentModel: Model<TournamentDocument>,
    @InjectModel(TournamentParticipant.name)
    private readonly participantModel: Model<TournamentParticipantDocument>,
    @InjectModel(TournamentGroup.name) private readonly groupModel: Model<TournamentGroupDocument>,
    @InjectModel(TournamentMatch.name) private readonly matchModel: Model<TournamentMatchDocument>,
  ) {}

  /** Deterministic shuffle of indices 0..n-1 from seed string. */
  private seededShuffle(n: number, seed: string): number[] {
    const arr = Array.from({ length: n }, (_, i) => i);
    let h = createHash('sha256').update(seed).digest();
    for (let i = n - 1; i > 0; i--) {
      const j = h[i % h.length] % (i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
      h = createHash('sha256').update(h).update(Buffer.from([i, j])).digest();
    }
    return arr;
  }

  private buildGroupBracketDefs(groupNumber: number, players: Types.ObjectId[], seed: string): BracketMatchDef[] {
    const defs: BracketMatchDef[] = [];
    const shuffle = this.seededShuffle(players.length, `${seed}:g${groupNumber}`);
    const prelimIdx = shuffle.slice(0, 4);
    const byeIdx = shuffle.slice(4, 10);
    const prelimPlayers = prelimIdx.map((i) => players[i]);
    const byePlayers = byeIdx.map((i) => players[i]);

    // round 0: preliminary (2 matches)
    defs.push({
      phase: TournamentPhase.GROUPS,
      groupNumber,
      roundName: TournamentMatchRoundName.PRELIMINARY,
      roundIndex: 0,
      matchIndex: groupNumber * 10 + 0,
      playerA: prelimPlayers[0],
      playerB: prelimPlayers[1],
      nextRef: { roundIndex: 1, matchIndex: groupNumber * 10 + 3, slot: 'B' },
    });
    defs.push({
      phase: TournamentPhase.GROUPS,
      groupNumber,
      roundName: TournamentMatchRoundName.PRELIMINARY,
      roundIndex: 0,
      matchIndex: groupNumber * 10 + 1,
      playerA: prelimPlayers[2],
      playerB: prelimPlayers[3],
      nextRef: { roundIndex: 1, matchIndex: groupNumber * 10 + 2, slot: 'B' },
    });

    // round 1: quarterfinals (4 matches)
    const qfPairs: Array<[Types.ObjectId, Types.ObjectId]> = [
      [byePlayers[0], byePlayers[1]],
      [byePlayers[2], byePlayers[3]],
      [byePlayers[4], byePlayers[5]],
    ];
    for (let q = 0; q < 3; q++) {
      defs.push({
        phase: TournamentPhase.GROUPS,
        groupNumber,
        roundName: TournamentMatchRoundName.QUARTERFINAL,
        roundIndex: 1,
        matchIndex: groupNumber * 10 + q,
        playerA: qfPairs[q][0],
        playerB: qfPairs[q][1],
        nextRef: { roundIndex: 2, matchIndex: groupNumber * 10 + (q < 2 ? 0 : 1), slot: q < 2 ? 'A' : 'B' },
      });
    }
    // QF4: prelim winners (players assigned when prelim completes)
    defs.push({
      phase: TournamentPhase.GROUPS,
      groupNumber,
      roundName: TournamentMatchRoundName.QUARTERFINAL,
      roundIndex: 1,
      matchIndex: groupNumber * 10 + 3,
      nextRef: { roundIndex: 2, matchIndex: groupNumber * 10 + 1, slot: 'A' },
    });

    // round 2: semifinals
    defs.push({
      phase: TournamentPhase.GROUPS,
      groupNumber,
      roundName: TournamentMatchRoundName.SEMIFINAL,
      roundIndex: 2,
      matchIndex: groupNumber * 10 + 0,
      nextRef: { roundIndex: 3, matchIndex: groupNumber * 10 + 0, slot: 'A' },
    });
    defs.push({
      phase: TournamentPhase.GROUPS,
      groupNumber,
      roundName: TournamentMatchRoundName.SEMIFINAL,
      roundIndex: 2,
      matchIndex: groupNumber * 10 + 1,
      nextRef: { roundIndex: 3, matchIndex: groupNumber * 10 + 0, slot: 'B' },
    });

    // round 3: group final
    defs.push({
      phase: TournamentPhase.GROUPS,
      groupNumber,
      roundName: TournamentMatchRoundName.GROUP_FINAL,
      roundIndex: 3,
      matchIndex: groupNumber * 10 + 0,
    });

    return defs;
  }

  private buildFinalsDefs(winnerIds: Types.ObjectId[]): BracketMatchDef[] {
    const sorted = [...winnerIds];
    // winners already ordered by seed externally
    const [s1, s2, s3, s4, s5] = sorted;
    const base = 1000;
    return [
      {
        phase: TournamentPhase.FINALS,
        roundName: TournamentMatchRoundName.FINALS_PLAYIN,
        roundIndex: base,
        matchIndex: 0,
        playerA: s4,
        playerB: s5,
        nextRef: { roundIndex: base + 1, matchIndex: 0, slot: 'B' },
      },
      {
        phase: TournamentPhase.FINALS,
        roundName: TournamentMatchRoundName.FINALS_PLAYIN,
        roundIndex: base,
        matchIndex: 1,
        playerA: s2,
        playerB: s3,
        nextRef: { roundIndex: base + 2, matchIndex: 0, slot: 'B' },
      },
      {
        phase: TournamentPhase.FINALS,
        roundName: TournamentMatchRoundName.FINALS_SEMIFINAL,
        roundIndex: base + 1,
        matchIndex: 0,
        playerA: s1,
        nextRef: { roundIndex: base + 2, matchIndex: 0, slot: 'A' },
      },
      {
        phase: TournamentPhase.FINALS,
        roundName: TournamentMatchRoundName.GRAND_FINAL,
        roundIndex: base + 2,
        matchIndex: 0,
      },
    ];
  }

  async generateGroupsAndBrackets(tournament: TournamentDocument): Promise<void> {
    const participants = await this.participantModel
      .find({ tournament_id: tournament._id })
      .sort({ seed: 1 })
      .exec();

    for (let g = 1; g <= TOURNAMENT_GROUP_COUNT; g++) {
      await this.groupModel.findOneAndUpdate(
        { tournament_id: tournament._id, group_number: g },
        { $set: { status: 'active' } },
        { upsert: true },
      );
    }

    const seed = tournament.bracket_seed || tournament._id.toString();
    const allDefs: BracketMatchDef[] = [];

    for (let g = 1; g <= TOURNAMENT_GROUP_COUNT; g++) {
      const groupPlayers = participants
        .filter((p) => p.group_number === g)
        .sort((a, b) => (a.seed ?? 0) - (b.seed ?? 0))
        .map((p) => p.user_id as Types.ObjectId);
      allDefs.push(...this.buildGroupBracketDefs(g, groupPlayers, seed));
    }

    const refMap = new Map<string, Types.ObjectId>();
    const docs: TournamentMatchDocument[] = [];

    for (const d of allDefs) {
      const doc = await this.matchModel.create({
        tournament_id: tournament._id,
        group_number: d.groupNumber,
        phase: d.phase,
        round_name: d.roundName,
        round_index: d.roundIndex,
        match_index: d.matchIndex,
        status: TournamentMatchStatus.PENDING,
        player_a_user_id: d.playerA,
        player_b_user_id: d.playerB,
        is_bye: d.isBye ?? false,
      });
      refMap.set(`${d.roundIndex}:${d.matchIndex}`, doc._id as Types.ObjectId);
      docs.push(doc);
    }

    for (let i = 0; i < allDefs.length; i++) {
      const d = allDefs[i];
      if (d.nextRef) {
        const nextId = refMap.get(`${d.nextRef.roundIndex}:${d.nextRef.matchIndex}`);
        if (nextId) {
          docs[i].next_match_id = nextId;
          docs[i].next_slot = d.nextRef.slot;
          await docs[i].save();
        }
      }
    }

    for (const p of participants) {
      p.status = TournamentParticipantStatus.ACTIVE;
      await p.save();
    }

    tournament.current_phase = TournamentPhase.GROUPS;
    tournament.current_round_index = 0;
    await tournament.save();

    this.logger.log(`event=tournament_bracket_generated tournament=${tournament._id} matches=${allDefs.length}`);
  }

  async generateFinalsBracket(tournament: TournamentDocument): Promise<void> {
    const groupWinners = await this.participantModel
      .find({ tournament_id: tournament._id, status: TournamentParticipantStatus.GROUP_WINNER })
      .sort({ seed: 1 })
      .exec();

    if (groupWinners.length !== TOURNAMENT_GROUP_COUNT) {
      throw new Error('Not all group winners decided');
    }

    const winnerIds = groupWinners.map((p) => p.user_id as Types.ObjectId);
    const defs = this.buildFinalsDefs(winnerIds);
    const refMap = new Map<string, Types.ObjectId>();
    const docs: TournamentMatchDocument[] = [];

    for (const d of defs) {
      const doc = await this.matchModel.create({
        tournament_id: tournament._id,
        phase: d.phase,
        round_name: d.roundName,
        round_index: d.roundIndex,
        match_index: d.matchIndex,
        status: TournamentMatchStatus.PENDING,
        player_a_user_id: d.playerA,
        player_b_user_id: d.playerB,
      });
      refMap.set(`${d.roundIndex}:${d.matchIndex}`, doc._id as Types.ObjectId);
      docs.push(doc);
    }

    for (let i = 0; i < defs.length; i++) {
      const d = defs[i];
      if (d.nextRef) {
        const nextId = refMap.get(`${d.nextRef.roundIndex}:${d.nextRef.matchIndex}`);
        if (nextId) {
          docs[i].next_match_id = nextId;
          docs[i].next_slot = d.nextRef.slot;
          await docs[i].save();
        }
      }
    }

    tournament.current_phase = TournamentPhase.FINALS;
    tournament.current_round_index = defs[0]?.roundIndex ?? 1000;
    tournament.status = tournament.status; // caller sets finals_running
    await tournament.save();
  }
}
