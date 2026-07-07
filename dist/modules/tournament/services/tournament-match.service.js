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
var TournamentMatchService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TournamentMatchService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const crypto_1 = require("crypto");
const tournament_match_schema_1 = require("../schemas/tournament-match.schema");
const tournament_schema_1 = require("../schemas/tournament.schema");
const tournament_participant_schema_1 = require("../schemas/tournament-participant.schema");
const tournament_group_schema_1 = require("../schemas/tournament-group.schema");
const room_schema_1 = require("../../room/schemas/room.schema");
const room_schema_2 = require("../../room/schemas/room.schema");
const tournament_constants_1 = require("../constants/tournament.constants");
const tournament_language_util_1 = require("../tournament-language.util");
const tournament_bracket_service_1 = require("./tournament-bracket.service");
const tournament_settlement_service_1 = require("./tournament-settlement.service");
const tournaments_gateway_1 = require("../../websockets/tournaments/tournaments.gateway");
let TournamentMatchService = TournamentMatchService_1 = class TournamentMatchService {
    matchModel;
    tournamentModel;
    participantModel;
    groupModel;
    roomModel;
    bracketService;
    settlement;
    tournamentsGateway;
    logger = new common_1.Logger(TournamentMatchService_1.name);
    constructor(matchModel, tournamentModel, participantModel, groupModel, roomModel, bracketService, settlement, tournamentsGateway) {
        this.matchModel = matchModel;
        this.tournamentModel = tournamentModel;
        this.participantModel = participantModel;
        this.groupModel = groupModel;
        this.roomModel = roomModel;
        this.bracketService = bracketService;
        this.settlement = settlement;
        this.tournamentsGateway = tournamentsGateway;
    }
    async createTournamentRoom(tournament, match) {
        const code = (0, crypto_1.randomBytes)(8).toString('hex');
        const players = [];
        if (match.player_a_user_id) {
            players.push({ playerId: match.player_a_user_id, ready: false });
        }
        if (match.player_b_user_id) {
            players.push({ playerId: match.player_b_user_id, ready: false });
        }
        const room = await this.roomModel.create({
            name: `Tournament ${(0, tournament_language_util_1.pickLocalizedField)(tournament.title, 'en')}`,
            code,
            game_id: tournament.game_id,
            players,
            bet_amount: 0,
            house_edge: 0,
            public: false,
            player_limit: 2,
            status: room_schema_2.RoomStatus.WAITING,
            source: 'tournament',
            tournament_id: tournament._id,
            tournament_match_id: match._id,
            turn_timer_seconds: tournament.turn_timer_seconds,
        });
        match.room_id = room._id;
        match.status = tournament_constants_1.TournamentMatchStatus.READY;
        await match.save();
        void this.tournamentsGateway.emitMatchUpdate(tournament._id.toString());
        return room._id;
    }
    async ensureRoomForMatch(tournament, match) {
        if (match.status === tournament_constants_1.TournamentMatchStatus.FINISHED ||
            match.status === tournament_constants_1.TournamentMatchStatus.FORFEITED ||
            match.status === tournament_constants_1.TournamentMatchStatus.CANCELLED) {
            return null;
        }
        if (!match.player_a_user_id || !match.player_b_user_id)
            return null;
        if (match.room_id) {
            const existing = await this.roomModel.findById(match.room_id).select('status').lean();
            if (existing) {
                if (existing.status !== room_schema_2.RoomStatus.FINISHED) {
                    if (match.status === tournament_constants_1.TournamentMatchStatus.WAITING_PRESENCE) {
                        match.status = tournament_constants_1.TournamentMatchStatus.READY;
                        await match.save();
                    }
                }
                return match.room_id;
            }
            match.room_id = undefined;
            await match.save();
        }
        return this.createTournamentRoom(tournament, match);
    }
    async advanceWinner(match, winnerId, reason) {
        if (match.status === tournament_constants_1.TournamentMatchStatus.FINISHED || match.status === tournament_constants_1.TournamentMatchStatus.FORFEITED) {
            return;
        }
        const loserId = match.player_a_user_id?.toString() === winnerId.toString()
            ? match.player_b_user_id
            : match.player_a_user_id;
        match.winner_user_id = winnerId;
        match.loser_user_id = loserId ?? undefined;
        match.status = reason.includes('forfeit') || reason === 'bye'
            ? tournament_constants_1.TournamentMatchStatus.FORFEITED
            : tournament_constants_1.TournamentMatchStatus.FINISHED;
        match.result_reason = reason;
        match.finished_at = new Date();
        await match.save();
        if (loserId && reason !== 'bye') {
            await this.participantModel.updateOne({ tournament_id: match.tournament_id, user_id: loserId }, {
                $set: {
                    status: tournament_constants_1.TournamentParticipantStatus.ELIMINATED,
                    eliminated_at: new Date(),
                },
            });
        }
        if (match.next_match_id && match.next_slot) {
            const next = await this.matchModel.findById(match.next_match_id);
            if (next) {
                if (match.next_slot === 'A')
                    next.player_a_user_id = winnerId;
                else
                    next.player_b_user_id = winnerId;
                await next.save();
            }
        }
        await this.checkRoundComplete(match);
    }
    async checkRoundComplete(completedMatch) {
        const tournamentId = completedMatch.tournament_id;
        const roundIndex = completedMatch.round_index;
        const pending = await this.matchModel.countDocuments({
            tournament_id: tournamentId,
            round_index: roundIndex,
            status: { $nin: [tournament_constants_1.TournamentMatchStatus.FINISHED, tournament_constants_1.TournamentMatchStatus.FORFEITED] },
        });
        if (pending > 0)
            return;
        const tournament = await this.tournamentModel.findById(tournamentId);
        if (!tournament)
            return;
        if (completedMatch.round_name === tournament_constants_1.TournamentMatchRoundName.GRAND_FINAL) {
            await this.settlement.settle(tournament, completedMatch.winner_user_id, completedMatch.loser_user_id);
            void this.tournamentsGateway.emitMatchUpdate(tournamentId.toString());
            return;
        }
        if (completedMatch.round_name === tournament_constants_1.TournamentMatchRoundName.GROUP_FINAL) {
            await this.handleGroupFinalsComplete(tournament, roundIndex);
            return;
        }
        tournament.status = tournament_constants_1.TournamentStatus.BETWEEN_ROUNDS;
        tournament.between_rounds_ends_at = new Date(Date.now() + tournament.between_rounds_pause_seconds * 1000);
        await tournament.save();
    }
    async handleGroupFinalsComplete(tournament, roundIndex) {
        const gfMatches = await this.matchModel.find({
            tournament_id: tournament._id,
            round_name: tournament_constants_1.TournamentMatchRoundName.GROUP_FINAL,
            round_index: roundIndex,
        });
        for (const m of gfMatches) {
            if (!m.winner_user_id || !m.group_number)
                continue;
            await this.groupModel.updateOne({ tournament_id: tournament._id, group_number: m.group_number }, { $set: { winner_user_id: m.winner_user_id, status: 'finished' } });
            await this.participantModel.updateOne({ tournament_id: tournament._id, user_id: m.winner_user_id }, { $set: { status: tournament_constants_1.TournamentParticipantStatus.GROUP_WINNER } });
        }
        const winners = await this.participantModel.countDocuments({
            tournament_id: tournament._id,
            status: tournament_constants_1.TournamentParticipantStatus.GROUP_WINNER,
        });
        if (winners >= tournament.group_count) {
            if (tournament.group_count === 1) {
                const decisive = gfMatches.find((m) => m.winner_user_id);
                if (decisive?.winner_user_id) {
                    await this.settlement.settle(tournament, decisive.winner_user_id, (decisive.loser_user_id ?? decisive.winner_user_id));
                    void this.tournamentsGateway.emitMatchUpdate(tournament._id.toString());
                }
                return;
            }
            await this.bracketService.generateFinalsBracket(tournament);
            const fresh = await this.tournamentModel.findById(tournament._id);
            if (!fresh)
                return;
            fresh.status = tournament_constants_1.TournamentStatus.FINALS_PENDING;
            fresh.between_rounds_ends_at = new Date(Date.now() + fresh.between_rounds_pause_seconds * 1000);
            await fresh.save();
            void this.tournamentsGateway.emitMatchUpdate(fresh._id.toString());
            return;
        }
        tournament.status = tournament_constants_1.TournamentStatus.BETWEEN_ROUNDS;
        tournament.between_rounds_ends_at = new Date(Date.now() + tournament.between_rounds_pause_seconds * 1000);
        await tournament.save();
    }
    async tryCompleteFromFinishedRoom(room, winnerId, reason) {
        if (room.source !== 'tournament' || !room.tournament_match_id)
            return;
        const loserId = room.players
            ?.find((p) => p.playerId.toString() !== winnerId)
            ?.playerId?.toString();
        await this.completeFromGameRoom(room, { winnerId, loserId, reason });
    }
    async completeFromGameRoom(room, result) {
        if (!room.tournament_match_id)
            return;
        const match = await this.matchModel.findById(room.tournament_match_id);
        if (!match)
            return;
        await this.advanceWinner(match, new mongoose_2.Types.ObjectId(result.winnerId), result.reason);
    }
    async forfeitMatch(matchId, winnerId, reason) {
        const match = await this.matchModel.findById(matchId);
        if (!match)
            return;
        await this.advanceWinner(match, new mongoose_2.Types.ObjectId(winnerId), reason);
    }
    async activateRoundMatches(tournament, roundIndex) {
        const matches = await this.matchModel.find({
            tournament_id: tournament._id,
            round_index: roundIndex,
            status: tournament_constants_1.TournamentMatchStatus.PENDING,
        });
        for (const m of matches) {
            if (m.player_a_user_id && m.player_b_user_id) {
                await this.ensureRoomForMatch(tournament, m);
            }
            else if (m.player_a_user_id && !m.player_b_user_id) {
                await this.advanceWinner(m, m.player_a_user_id, 'bye');
            }
            else if (!m.player_a_user_id && m.player_b_user_id) {
                await this.advanceWinner(m, m.player_b_user_id, 'bye');
            }
        }
        tournament.current_round_index = roundIndex;
        tournament.status =
            tournament.current_phase === tournament_constants_1.TournamentPhase.FINALS
                ? tournament_constants_1.TournamentStatus.FINALS_RUNNING
                : tournament_constants_1.TournamentStatus.RUNNING;
        await tournament.save();
        void this.tournamentsGateway.emitMatchUpdate(tournament._id.toString());
    }
};
exports.TournamentMatchService = TournamentMatchService;
exports.TournamentMatchService = TournamentMatchService = TournamentMatchService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(tournament_match_schema_1.TournamentMatch.name)),
    __param(1, (0, mongoose_1.InjectModel)(tournament_schema_1.Tournament.name)),
    __param(2, (0, mongoose_1.InjectModel)(tournament_participant_schema_1.TournamentParticipant.name)),
    __param(3, (0, mongoose_1.InjectModel)(tournament_group_schema_1.TournamentGroup.name)),
    __param(4, (0, mongoose_1.InjectModel)(room_schema_1.Room.name)),
    __param(6, (0, common_1.Inject)((0, common_1.forwardRef)(() => tournament_settlement_service_1.TournamentSettlementService))),
    __param(7, (0, common_1.Inject)((0, common_1.forwardRef)(() => tournaments_gateway_1.TournamentsGateway))),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        tournament_bracket_service_1.TournamentBracketService,
        tournament_settlement_service_1.TournamentSettlementService,
        tournaments_gateway_1.TournamentsGateway])
], TournamentMatchService);
//# sourceMappingURL=tournament-match.service.js.map