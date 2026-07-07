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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TournamentStateService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const tournament_schema_1 = require("../schemas/tournament.schema");
const tournament_participant_schema_1 = require("../schemas/tournament-participant.schema");
const tournament_group_schema_1 = require("../schemas/tournament-group.schema");
const tournament_match_schema_1 = require("../schemas/tournament-match.schema");
const room_schema_1 = require("../../room/schemas/room.schema");
const tournament_language_util_1 = require("../tournament-language.util");
const tournament_constants_1 = require("../constants/tournament.constants");
let TournamentStateService = class TournamentStateService {
    tournamentModel;
    participantModel;
    groupModel;
    matchModel;
    roomModel;
    constructor(tournamentModel, participantModel, groupModel, matchModel, roomModel) {
        this.tournamentModel = tournamentModel;
        this.participantModel = participantModel;
        this.groupModel = groupModel;
        this.matchModel = matchModel;
        this.roomModel = roomModel;
    }
    buildTimeProjection(t) {
        const now = Date.now();
        const startsMs = t.starts_at.getTime();
        let remainingMs = Math.max(0, startsMs - now);
        if (t.status === tournament_constants_1.TournamentStatus.RUNNING ||
            t.status === tournament_constants_1.TournamentStatus.FINALS_RUNNING ||
            t.status === tournament_constants_1.TournamentStatus.LOCKING ||
            t.status === tournament_constants_1.TournamentStatus.BETWEEN_ROUNDS ||
            t.status === tournament_constants_1.TournamentStatus.FINALS_PENDING) {
            remainingMs = 0;
        }
        let pauseRemainingMs = null;
        if (t.between_rounds_ends_at &&
            (t.status === tournament_constants_1.TournamentStatus.BETWEEN_ROUNDS || t.status === tournament_constants_1.TournamentStatus.FINALS_PENDING)) {
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
    async resolveMyActiveMatch(tournamentId, userId) {
        const uid = new mongoose_2.Types.ObjectId(userId);
        const reg = await this.participantModel
            .findOne({ tournament_id: tournamentId, user_id: uid })
            .select('status')
            .lean();
        if (!reg)
            return null;
        const blocked = new Set([
            tournament_constants_1.TournamentParticipantStatus.ELIMINATED,
            tournament_constants_1.TournamentParticipantStatus.FORFEITED,
            tournament_constants_1.TournamentParticipantStatus.REFUNDED,
            tournament_constants_1.TournamentParticipantStatus.RUNNER_UP,
            tournament_constants_1.TournamentParticipantStatus.WINNER,
        ]);
        if (blocked.has(reg.status))
            return null;
        const match = await this.matchModel
            .findOne({
            tournament_id: tournamentId,
            $or: [{ player_a_user_id: uid }, { player_b_user_id: uid }],
            status: {
                $in: [
                    tournament_constants_1.TournamentMatchStatus.WAITING_PRESENCE,
                    tournament_constants_1.TournamentMatchStatus.READY,
                    tournament_constants_1.TournamentMatchStatus.STARTED,
                ],
            },
        })
            .sort({ round_index: -1, match_index: 1 })
            .lean();
        if (!match)
            return null;
        const opponentId = match.player_a_user_id?.toString() === userId
            ? match.player_b_user_id
            : match.player_a_user_id;
        let opponentUsername = null;
        if (opponentId) {
            const opp = await this.participantModel
                .findOne({ tournament_id: tournamentId, user_id: opponentId })
                .select('username')
                .lean();
            opponentUsername = opp?.username ?? null;
        }
        const roomId = match.room_id?.toString() ?? null;
        const status = match.status;
        if (roomId) {
            const room = await this.roomModel.findById(roomId).select('status').lean();
            if (!room || room.status === 'finished')
                return null;
        }
        return {
            matchId: match._id.toString(),
            status,
            roomId,
            roundName: match.round_name,
            opponentUsername,
            presenceCheckAt: match.presence_check_at?.toISOString() ?? null,
            canJoin: !!roomId && (status === tournament_constants_1.TournamentMatchStatus.READY || status === tournament_constants_1.TournamentMatchStatus.STARTED),
            needsLobby: status === tournament_constants_1.TournamentMatchStatus.WAITING_PRESENCE,
        };
    }
    async toPublicDetail(t, userId, langHeader) {
        const lang = (0, tournament_language_util_1.resolveRequestLang)(langHeader);
        const time = this.buildTimeProjection(t);
        let myRegistration = null;
        if (userId) {
            const reg = await this.participantModel
                .findOne({ tournament_id: t._id, user_id: new mongoose_2.Types.ObjectId(userId) })
                .lean();
            if (reg) {
                myRegistration = {
                    status: reg.status,
                    seed: reg.seed,
                    groupNumber: reg.group_number,
                };
            }
        }
        let myActiveMatch = null;
        if (userId) {
            myActiveMatch = await this.resolveMyActiveMatch(t._id, userId);
        }
        return {
            id: t._id.toString(),
            title: (0, tournament_language_util_1.pickLocalizedField)(t.title, lang),
            description: (0, tournament_language_util_1.pickLocalizedField)(t.description, lang),
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
    async toAdminDetail(t, userId) {
        const base = (0, tournament_language_util_1.toAdminTournamentRecord)(t);
        let myRegistration = null;
        if (userId) {
            const reg = await this.participantModel
                .findOne({ tournament_id: t._id, user_id: new mongoose_2.Types.ObjectId(userId) })
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
    async getBracket(tournamentId) {
        if (!mongoose_2.Types.ObjectId.isValid(tournamentId)) {
            throw new common_1.NotFoundException('Tournament not found');
        }
        const oid = new mongoose_2.Types.ObjectId(tournamentId);
        const exists = await this.tournamentModel.findById(oid).select('_id').lean();
        if (!exists) {
            throw new common_1.NotFoundException('Tournament not found');
        }
        const groups = await this.groupModel.find({ tournament_id: oid }).sort({ group_number: 1 }).lean();
        const matches = await this.matchModel.find({ tournament_id: oid }).sort({ round_index: 1, match_index: 1 }).lean();
        const participants = await this.participantModel.find({ tournament_id: oid }).lean();
        const byUser = new Map(participants.map((p) => [p.user_id.toString(), p]));
        const mapMatch = (m) => ({
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
    async listForUser(userId, langHeader) {
        const parts = await this.participantModel
            .find({
            user_id: new mongoose_2.Types.ObjectId(userId),
            status: { $nin: [tournament_constants_1.TournamentParticipantStatus.REFUNDED] },
        })
            .lean();
        if (parts.length === 0)
            return [];
        const ids = parts.map((p) => p.tournament_id);
        const tournaments = await this.tournamentModel
            .find({
            _id: { $in: ids },
            status: {
                $nin: [
                    tournament_constants_1.TournamentStatus.DRAFT,
                    tournament_constants_1.TournamentStatus.CANCELLED,
                    tournament_constants_1.TournamentStatus.FINISHED,
                ],
            },
        })
            .sort({ starts_at: 1 })
            .exec();
        return Promise.all(tournaments.map((t) => this.toPublicDetail(t, userId, langHeader)));
    }
    async listHistoryForUser(userId, langHeader) {
        const lang = (0, tournament_language_util_1.resolveRequestLang)(langHeader);
        const uid = new mongoose_2.Types.ObjectId(userId);
        const parts = await this.participantModel
            .find({ user_id: uid })
            .sort({ registered_at: -1 })
            .lean();
        if (parts.length === 0)
            return [];
        const partByTournament = new Map(parts.map((p) => [p.tournament_id.toString(), p]));
        const tournamentIds = parts.map((p) => p.tournament_id);
        const tournaments = await this.tournamentModel
            .find({
            _id: { $in: tournamentIds },
            status: { $in: [tournament_constants_1.TournamentStatus.FINISHED, tournament_constants_1.TournamentStatus.CANCELLED] },
        })
            .sort({ finished_at: -1, starts_at: -1 })
            .lean();
        return tournaments
            .map((t) => {
            const p = partByTournament.get(t._id.toString());
            if (!p)
                return null;
            const { first, second } = this.resolvePlaceAmounts(t);
            let prizeAmount = 0;
            if (p.status === tournament_constants_1.TournamentParticipantStatus.WINNER) {
                prizeAmount = first;
            }
            else if (p.status === tournament_constants_1.TournamentParticipantStatus.RUNNER_UP) {
                prizeAmount = second;
            }
            else if (t.status === tournament_constants_1.TournamentStatus.CANCELLED &&
                p.status !== tournament_constants_1.TournamentParticipantStatus.REFUNDED) {
                prizeAmount = t.buy_in;
            }
            return {
                id: t._id.toString(),
                title: (0, tournament_language_util_1.pickLocalizedField)(t.title, lang),
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
            .filter((row) => row != null);
    }
    resolvePlaceAmounts(t) {
        if (t.first_place_amount > 0 || t.second_place_amount > 0) {
            return { first: t.first_place_amount, second: t.second_place_amount };
        }
        const gross = t.gross_prize_pool ?? 0;
        const house = Math.round(gross * (t.house_fee_percent / 100) * 100) / 100;
        const first = Math.round(gross * (t.first_place_percent / 100) * 100) / 100;
        const second = Math.round(Math.max(0, gross - house - first) * 100) / 100;
        return { first, second };
    }
    async listVisible() {
        return this.tournamentModel
            .find({
            status: {
                $in: [
                    tournament_constants_1.TournamentStatus.OPEN,
                    tournament_constants_1.TournamentStatus.FULL,
                    tournament_constants_1.TournamentStatus.COUNTDOWN,
                    tournament_constants_1.TournamentStatus.RUNNING,
                    tournament_constants_1.TournamentStatus.BETWEEN_ROUNDS,
                    tournament_constants_1.TournamentStatus.FINALS_PENDING,
                    tournament_constants_1.TournamentStatus.FINALS_RUNNING,
                ],
            },
        })
            .sort({ starts_at: 1 })
            .exec();
    }
};
exports.TournamentStateService = TournamentStateService;
exports.TournamentStateService = TournamentStateService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(tournament_schema_1.Tournament.name)),
    __param(1, (0, mongoose_1.InjectModel)(tournament_participant_schema_1.TournamentParticipant.name)),
    __param(2, (0, mongoose_1.InjectModel)(tournament_group_schema_1.TournamentGroup.name)),
    __param(3, (0, mongoose_1.InjectModel)(tournament_match_schema_1.TournamentMatch.name)),
    __param(4, (0, mongoose_1.InjectModel)(room_schema_1.Room.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model])
], TournamentStateService);
//# sourceMappingURL=tournament-state.service.js.map