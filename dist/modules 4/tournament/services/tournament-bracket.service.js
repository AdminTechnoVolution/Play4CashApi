"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var TournamentBracketService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TournamentBracketService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const crypto_1 = require("crypto");
const tournament_schema_1 = require("../schemas/tournament.schema");
const tournament_participant_schema_1 = require("../schemas/tournament-participant.schema");
const tournament_group_schema_1 = require("../schemas/tournament-group.schema");
const tournament_match_schema_1 = require("../schemas/tournament-match.schema");
const tournament_constants_1 = require("../constants/tournament.constants");
let TournamentBracketService = TournamentBracketService_1 = class TournamentBracketService {
    tournamentModel;
    participantModel;
    groupModel;
    matchModel;
    logger = new common_1.Logger(TournamentBracketService_1.name);
    constructor(tournamentModel, participantModel, groupModel, matchModel) {
        this.tournamentModel = tournamentModel;
        this.participantModel = participantModel;
        this.groupModel = groupModel;
        this.matchModel = matchModel;
    }
    seededShuffle(n, seed) {
        const arr = Array.from({ length: n }, (_, i) => i);
        let h = (0, crypto_1.createHash)('sha256').update(seed).digest();
        for (let i = n - 1; i > 0; i--) {
            const j = h[i % h.length] % (i + 1);
            [arr[i], arr[j]] = [arr[j], arr[i]];
            h = (0, crypto_1.createHash)('sha256').update(h).update(Buffer.from([i, j])).digest();
        }
        return arr;
    }
    buildGroupBracketDefs(groupNumber, players, seed, groupSize) {
        if (groupSize === 2) {
            if (players.length < 2) {
                this.logger.warn(`event=group_underfilled group=${groupNumber} players=${players.length} expected=2`);
            }
            return [
                {
                    phase: tournament_constants_1.TournamentPhase.GROUPS,
                    groupNumber,
                    roundName: tournament_constants_1.TournamentMatchRoundName.GROUP_FINAL,
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
    buildLegacyTenPlayerGroupBracket(groupNumber, players, seed) {
        const defs = [];
        const shuffle = this.seededShuffle(players.length, `${seed}:g${groupNumber}`);
        const prelimIdx = shuffle.slice(0, 4);
        const byeIdx = shuffle.slice(4, 10);
        const prelimPlayers = prelimIdx.map((i) => players[i]);
        const byePlayers = byeIdx.map((i) => players[i]);
        defs.push({
            phase: tournament_constants_1.TournamentPhase.GROUPS,
            groupNumber,
            roundName: tournament_constants_1.TournamentMatchRoundName.PRELIMINARY,
            roundIndex: 0,
            matchIndex: groupNumber * 10 + 0,
            playerA: prelimPlayers[0],
            playerB: prelimPlayers[1],
            nextRef: { roundIndex: 1, matchIndex: groupNumber * 10 + 3, slot: 'B' },
        });
        defs.push({
            phase: tournament_constants_1.TournamentPhase.GROUPS,
            groupNumber,
            roundName: tournament_constants_1.TournamentMatchRoundName.PRELIMINARY,
            roundIndex: 0,
            matchIndex: groupNumber * 10 + 1,
            playerA: prelimPlayers[2],
            playerB: prelimPlayers[3],
            nextRef: { roundIndex: 1, matchIndex: groupNumber * 10 + 2, slot: 'B' },
        });
        const qfPairs = [
            [byePlayers[0], byePlayers[1]],
            [byePlayers[2], byePlayers[3]],
            [byePlayers[4], byePlayers[5]],
        ];
        for (let q = 0; q < 3; q++) {
            defs.push({
                phase: tournament_constants_1.TournamentPhase.GROUPS,
                groupNumber,
                roundName: tournament_constants_1.TournamentMatchRoundName.QUARTERFINAL,
                roundIndex: 1,
                matchIndex: groupNumber * 10 + q,
                playerA: qfPairs[q][0],
                playerB: qfPairs[q][1],
                nextRef: { roundIndex: 2, matchIndex: groupNumber * 10 + (q < 2 ? 0 : 1), slot: q < 2 ? 'A' : 'B' },
            });
        }
        defs.push({
            phase: tournament_constants_1.TournamentPhase.GROUPS,
            groupNumber,
            roundName: tournament_constants_1.TournamentMatchRoundName.QUARTERFINAL,
            roundIndex: 1,
            matchIndex: groupNumber * 10 + 3,
            nextRef: { roundIndex: 2, matchIndex: groupNumber * 10 + 1, slot: 'A' },
        });
        defs.push({
            phase: tournament_constants_1.TournamentPhase.GROUPS,
            groupNumber,
            roundName: tournament_constants_1.TournamentMatchRoundName.SEMIFINAL,
            roundIndex: 2,
            matchIndex: groupNumber * 10 + 0,
            nextRef: { roundIndex: 3, matchIndex: groupNumber * 10 + 0, slot: 'A' },
        });
        defs.push({
            phase: tournament_constants_1.TournamentPhase.GROUPS,
            groupNumber,
            roundName: tournament_constants_1.TournamentMatchRoundName.SEMIFINAL,
            roundIndex: 2,
            matchIndex: groupNumber * 10 + 1,
            nextRef: { roundIndex: 3, matchIndex: groupNumber * 10 + 0, slot: 'B' },
        });
        defs.push({
            phase: tournament_constants_1.TournamentPhase.GROUPS,
            groupNumber,
            roundName: tournament_constants_1.TournamentMatchRoundName.GROUP_FINAL,
            roundIndex: 3,
            matchIndex: groupNumber * 10 + 0,
        });
        return defs;
    }
    bracketSeedOrder(bracketSize) {
        if (bracketSize <= 1)
            return [1];
        const half = this.bracketSeedOrder(bracketSize / 2);
        const out = [];
        for (const s of half) {
            out.push(s);
            out.push(bracketSize + 1 - s);
        }
        return out;
    }
    finalsRoundName(round, totalRounds) {
        if (round === totalRounds - 1)
            return tournament_constants_1.TournamentMatchRoundName.GRAND_FINAL;
        if (round === totalRounds - 2)
            return tournament_constants_1.TournamentMatchRoundName.FINALS_SEMIFINAL;
        return tournament_constants_1.TournamentMatchRoundName.FINALS_PLAYIN;
    }
    buildFinalsDefs(winnerIds) {
        const n = winnerIds.length;
        if (n < 2) {
            throw new Error('Finals require at least 2 group winners');
        }
        if (n === 2) {
            return [
                {
                    phase: tournament_constants_1.TournamentPhase.FINALS,
                    roundName: tournament_constants_1.TournamentMatchRoundName.GRAND_FINAL,
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
        const defs = [];
        let slots = seedOrder.map((seedNum) => seedNum <= n ? winnerIds[seedNum - 1] : undefined);
        for (let r = 0; r < numRounds; r++) {
            const roundIndex = base + r;
            const nextSlots = [];
            const matchCount = slots.length / 2;
            for (let m = 0; m < matchCount; m++) {
                const a = slots[m * 2];
                const b = slots[m * 2 + 1];
                const isFinal = r === numRounds - 1;
                if (!a && !b) {
                    nextSlots.push(undefined);
                    continue;
                }
                const def = {
                    phase: tournament_constants_1.TournamentPhase.FINALS,
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
    async generateGroupsAndBrackets(tournament) {
        const participants = await this.participantModel
            .find({ tournament_id: tournament._id })
            .sort({ seed: 1 })
            .exec();
        for (let g = 1; g <= tournament.group_count; g++) {
            await this.groupModel.findOneAndUpdate({ tournament_id: tournament._id, group_number: g }, { $set: { status: 'active' } }, { upsert: true });
        }
        const seed = tournament.bracket_seed || tournament._id.toString();
        const allDefs = [];
        for (let g = 1; g <= tournament.group_count; g++) {
            const groupPlayers = participants
                .filter((p) => p.group_number === g)
                .sort((a, b) => (a.seed ?? 0) - (b.seed ?? 0))
                .map((p) => p.user_id);
            allDefs.push(...this.buildGroupBracketDefs(g, groupPlayers, seed, tournament.group_size));
        }
        const refMap = new Map();
        const docs = [];
        for (const d of allDefs) {
            const doc = await this.matchModel.create({
                tournament_id: tournament._id,
                group_number: d.groupNumber,
                phase: d.phase,
                round_name: d.roundName,
                round_index: d.roundIndex,
                match_index: d.matchIndex,
                status: tournament_constants_1.TournamentMatchStatus.PENDING,
                player_a_user_id: d.playerA,
                player_b_user_id: d.playerB,
                is_bye: d.isBye ?? false,
            });
            refMap.set(`${d.roundIndex}:${d.matchIndex}`, doc._id);
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
            p.status = tournament_constants_1.TournamentParticipantStatus.ACTIVE;
            await p.save();
        }
        tournament.current_phase = tournament_constants_1.TournamentPhase.GROUPS;
        tournament.current_round_index = 0;
        await tournament.save();
        this.logger.log(`event=tournament_bracket_generated tournament=${tournament._id} matches=${allDefs.length}`);
    }
    async generateFinalsBracket(tournament) {
        const groupWinners = await this.participantModel
            .find({ tournament_id: tournament._id, status: tournament_constants_1.TournamentParticipantStatus.GROUP_WINNER })
            .sort({ seed: 1 })
            .exec();
        if (groupWinners.length !== tournament.group_count) {
            throw new Error('Not all group winners decided');
        }
        const winnerIds = groupWinners.map((p) => p.user_id);
        const defs = this.buildFinalsDefs(winnerIds);
        const refMap = new Map();
        const docs = [];
        for (const d of defs) {
            const doc = await this.matchModel.create({
                tournament_id: tournament._id,
                phase: d.phase,
                round_name: d.roundName,
                round_index: d.roundIndex,
                match_index: d.matchIndex,
                status: tournament_constants_1.TournamentMatchStatus.PENDING,
                player_a_user_id: d.playerA,
                player_b_user_id: d.playerB,
            });
            refMap.set(`${d.roundIndex}:${d.matchIndex}`, doc._id);
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
        tournament.current_phase = tournament_constants_1.TournamentPhase.FINALS;
        tournament.current_round_index = defs[0]?.roundIndex ?? 1000;
        tournament.status = tournament.status;
        await tournament.save();
    }
};
exports.TournamentBracketService = TournamentBracketService;
exports.TournamentBracketService = TournamentBracketService = TournamentBracketService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(tournament_schema_1.Tournament.name)),
    __param(1, (0, mongoose_1.InjectModel)(tournament_participant_schema_1.TournamentParticipant.name)),
    __param(2, (0, mongoose_1.InjectModel)(tournament_group_schema_1.TournamentGroup.name)),
    __param(3, (0, mongoose_1.InjectModel)(tournament_match_schema_1.TournamentMatch.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model])
], TournamentBracketService);
//# sourceMappingURL=tournament-bracket.service.js.map