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

  private buildGroupBracketDefs(
    groupNumber: number,
    players: Types.ObjectId[],
    seed: string,
    groupSize: number,
  ): BracketMatchDef[] {
    if (groupSize === 2) {
      if (players.length < 2) {
        this.logger.warn(
          `event=group_underfilled group=${groupNumber} players=${players.length} expected=2`,
        );
      }
      return [
        {
          phase: TournamentPhase.GROUPS,
          groupNumber,
          roundName: TournamentMatchRoundName.GROUP_FINAL,
          roundIndex: 0,
          matchIndex: groupNumber * 10,
          playerA: players[0],
          playerB: players[1],
        },
      ];
    }
    if (groupSize === 10) {
      return this.buildLegacyTenPlayerGroupBracket(groupNumber, players, seed);
    }
    throw new Error(`Unsupported group size: ${groupSize}`);
  }

  /** Legacy MVP bracket (10 players per group). Kept for existing tournaments. */
  private buildLegacyTenPlayerGroupBracket(
    groupNumber: number,
    players: Types.ObjectId[],
    seed: string,
  ): BracketMatchDef[] {
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

  /** 1-based seed positions for a single-elimination bracket of `bracketSize`. */
  private bracketSeedOrder(bracketSize: number): number[] {
    if (bracketSize <= 1) return [1];
    const half = this.bracketSeedOrder(bracketSize / 2);
    const out: number[] = [];
    for (const s of half) {
      out.push(s);
      out.push(bracketSize + 1 - s);
    }
    return out;
  }

  private finalsRoundName(round: number, totalRounds: number): TournamentMatchRoundName {
    if (round === totalRounds - 1) return TournamentMatchRoundName.GRAND_FINAL;
    if (round === totalRounds - 2) return TournamentMatchRoundName.FINALS_SEMIFINAL;
    return TournamentMatchRoundName.FINALS_PLAYIN;
  }

  private buildFinalsDefs(winnerIds: Types.ObjectId[]): BracketMatchDef[] {
    const n = winnerIds.length;
    if (n < 2) {
      throw new Error('Finals require at least 2 group winners');
    }
    if (n === 2) {
      return [
        {
          phase: TournamentPhase.FINALS,
          roundName: TournamentMatchRoundName.GRAND_FINAL,
          roundIndex: 1000,
          matchIndex: 0,
          playerA: winnerIds[0],
          playerB: winnerIds[1],
        },
      ];
    }

    const bracketSize = 2 ** Math.ceil(Math.log2(n));
    const numRounds = Math.log2(bracketSize);
    const base = 1000;
    const seedOrder = this.bracketSeedOrder(bracketSize);
    const defs: BracketMatchDef[] = [];

    type Entrant = Types.ObjectId | undefined;
    let slots: Entrant[] = seedOrder.map((seedNum) =>
      seedNum <= n ? winnerIds[seedNum - 1] : undefined,
    );

    for (let r = 0; r < numRounds; r++) {
      const roundIndex = base + r;
      const nextSlots: Entrant[] = [];
      const matchCount = slots.length / 2;

      for (let m = 0; m < matchCount; m++) {
        const a = slots[m * 2];
        const b = slots[m * 2 + 1];
        const isFinal = r === numRounds - 1;

        if (!a && !b) {
          nextSlots.push(undefined);
          continue;
        }

        const def: BracketMatchDef = {
          phase: TournamentPhase.FINALS,
          roundName: this.finalsRoundName(r, numRounds),
          roundIndex,
          matchIndex: m,
          playerA: a,
          playerB: b,
        };

        if (!isFinal) {
          def.nextRef = {
            roundIndex: base + r + 1,
            matchIndex: Math.floor(m / 2),
            slot: m % 2 === 0 ? 'A' : 'B',
          };
        }

        defs.push(def);
        nextSlots.push(undefined);
      }

      slots = nextSlots;
    }

    return defs;
  }

  async generateGroupsAndBrackets(tournament: TournamentDocument): Promise<void> {
    const participants = await this.participantModel
      .find({ tournament_id: tournament._id })
      .sort({ seed: 1 })
      .exec();

    for (let g = 1; g <= tournament.group_count; g++) {
      await this.groupModel.findOneAndUpdate(
        { tournament_id: tournament._id, group_number: g },
        { $set: { status: 'active' } },
        { upsert: true },
      );
    }

    const seed = tournament.bracket_seed || tournament._id.toString();
    const allDefs: BracketMatchDef[] = [];

    for (let g = 1; g <= tournament.group_count; g++) {
      const groupPlayers = participants
        .filter((p) => p.group_number === g)
        .sort((a, b) => (a.seed ?? 0) - (b.seed ?? 0))
        .map((p) => p.user_id as Types.ObjectId);
      allDefs.push(...this.buildGroupBracketDefs(g, groupPlayers, seed, tournament.group_size));
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

    if (groupWinners.length !== tournament.group_count) {
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
