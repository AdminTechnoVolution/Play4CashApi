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
var TournamentSchedulerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TournamentSchedulerService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const common_2 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const redis_module_1 = require("../../../common/redis/redis.module");
const tournament_schema_1 = require("../schemas/tournament.schema");
const tournament_participant_schema_1 = require("../schemas/tournament-participant.schema");
const tournament_match_schema_1 = require("../schemas/tournament-match.schema");
const tournament_constants_1 = require("../constants/tournament.constants");
const tournament_bracket_service_1 = require("./tournament-bracket.service");
const tournament_match_service_1 = require("./tournament-match.service");
const tournament_ledger_service_1 = require("./tournament-ledger.service");
const tournaments_gateway_1 = require("../../websockets/tournaments/tournaments.gateway");
const room_schema_1 = require("../../room/schemas/room.schema");
const room_schema_2 = require("../../room/schemas/room.schema");
let TournamentSchedulerService = TournamentSchedulerService_1 = class TournamentSchedulerService {
    tournamentModel;
    participantModel;
    matchModel;
    roomModel;
    bracketService;
    matchService;
    ledger;
    redis;
    tournamentsGateway;
    logger = new common_1.Logger(TournamentSchedulerService_1.name);
    constructor(tournamentModel, participantModel, matchModel, roomModel, bracketService, matchService, ledger, redis, tournamentsGateway) {
        this.tournamentModel = tournamentModel;
        this.participantModel = participantModel;
        this.matchModel = matchModel;
        this.roomModel = roomModel;
        this.bracketService = bracketService;
        this.matchService = matchService;
        this.ledger = ledger;
        this.redis = redis;
        this.tournamentsGateway = tournamentsGateway;
    }
    async tick() {
        await this.processStartTimes();
        await this.processBetweenRounds();
        await this.repairStuckMatchesFromFinishedRooms();
        await this.repairBrokenMatchRooms();
        await this.activatePendingFinalsMatches();
    }
    async withLock(tournamentId, fn) {
        const lockKey = `job:tournament-scheduler:${tournamentId}`;
        const acquired = await this.redis.set(lockKey, '1', 'EX', 2, 'NX');
        if (!acquired)
            return;
        try {
            await fn();
        }
        finally {
            await this.redis.del(lockKey).catch(() => { });
        }
    }
    async processStartTimes() {
        const now = new Date();
        const due = await this.tournamentModel.find({
            status: { $in: [tournament_constants_1.TournamentStatus.OPEN, tournament_constants_1.TournamentStatus.FULL, tournament_constants_1.TournamentStatus.COUNTDOWN] },
            starts_at: { $lte: now },
        });
        for (const t of due) {
            await this.withLock(t._id.toString(), async () => {
                const fresh = await this.tournamentModel.findById(t._id);
                if (!fresh || fresh.status === tournament_constants_1.TournamentStatus.LOCKING)
                    return;
                fresh.status = tournament_constants_1.TournamentStatus.LOCKING;
                await fresh.save();
                if (fresh.registered_count < fresh.min_players) {
                    fresh.status = tournament_constants_1.TournamentStatus.CANCELLED;
                    await fresh.save();
                    const parts = await this.participantModel.find({ tournament_id: fresh._id });
                    await this.ledger.refundAllRegistered(fresh._id, parts.map((p) => ({ user_id: p.user_id, amount: fresh.buy_in })));
                    return;
                }
                await this.bracketService.generateGroupsAndBrackets(fresh);
                fresh.status = tournament_constants_1.TournamentStatus.RUNNING;
                fresh.current_round_index = 0;
                await fresh.save();
                await this.matchService.activateRoundMatches(fresh, 0);
                void this.tournamentsGateway.emitMatchUpdate(fresh._id.toString());
            });
        }
    }
    async processBetweenRounds() {
        const now = new Date();
        const paused = await this.tournamentModel.find({
            status: { $in: [tournament_constants_1.TournamentStatus.BETWEEN_ROUNDS, tournament_constants_1.TournamentStatus.FINALS_PENDING] },
            between_rounds_ends_at: { $lte: now },
        });
        for (const t of paused) {
            await this.withLock(t._id.toString(), async () => {
                const fresh = await this.tournamentModel.findById(t._id);
                if (!fresh ||
                    (fresh.status !== tournament_constants_1.TournamentStatus.BETWEEN_ROUNDS &&
                        fresh.status !== tournament_constants_1.TournamentStatus.FINALS_PENDING)) {
                    return;
                }
                if (fresh.status === tournament_constants_1.TournamentStatus.FINALS_PENDING) {
                    await this.matchService.activateRoundMatches(fresh, fresh.current_round_index);
                }
                else if (fresh.current_phase === 'finals') {
                    const nextRound = fresh.current_round_index + 1;
                    await this.matchService.activateRoundMatches(fresh, nextRound);
                }
                else {
                    const nextRound = fresh.current_round_index + 1;
                    const maxGroupRound = await this.matchModel
                        .findOne({ tournament_id: fresh._id, phase: tournament_constants_1.TournamentPhase.GROUPS })
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
    async repairStuckMatchesFromFinishedRooms() {
        const stuck = await this.matchModel.find({
            status: {
                $in: [
                    tournament_constants_1.TournamentMatchStatus.WAITING_PRESENCE,
                    tournament_constants_1.TournamentMatchStatus.READY,
                    tournament_constants_1.TournamentMatchStatus.STARTED,
                ],
            },
            room_id: { $exists: true, $ne: null },
        });
        for (const m of stuck) {
            const tid = m.tournament_id.toString();
            await this.withLock(`stuck:${tid}:${m._id.toString()}`, async () => {
                const freshMatch = await this.matchModel.findById(m._id);
                if (!freshMatch?.room_id)
                    return;
                if (freshMatch.status === tournament_constants_1.TournamentMatchStatus.FINISHED ||
                    freshMatch.status === tournament_constants_1.TournamentMatchStatus.FORFEITED) {
                    return;
                }
                const room = await this.roomModel.findById(freshMatch.room_id);
                if (!room || room.status !== room_schema_2.RoomStatus.FINISHED || !room.winner)
                    return;
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
                this.logger.log(`event=tournament_match_repaired_from_room matchId=${freshMatch._id.toString()} roomId=${room._id.toString()} winnerId=${winnerId}`);
                void this.tournamentsGateway.emitMatchUpdate(tid);
            });
        }
    }
    async repairBrokenMatchRooms() {
        const active = await this.matchModel.find({
            status: {
                $in: [
                    tournament_constants_1.TournamentMatchStatus.WAITING_PRESENCE,
                    tournament_constants_1.TournamentMatchStatus.READY,
                    tournament_constants_1.TournamentMatchStatus.STARTED,
                ],
            },
            player_a_user_id: { $exists: true, $ne: null },
            player_b_user_id: { $exists: true, $ne: null },
        });
        for (const m of active) {
            const tid = m.tournament_id.toString();
            await this.withLock(`repair:${tid}:${m._id.toString()}`, async () => {
                const freshMatch = await this.matchModel.findById(m._id);
                if (!freshMatch)
                    return;
                const tournament = await this.tournamentModel.findById(freshMatch.tournament_id);
                if (!tournament)
                    return;
                if (tournament.status === tournament_constants_1.TournamentStatus.FINISHED ||
                    tournament.status === tournament_constants_1.TournamentStatus.CANCELLED) {
                    return;
                }
                const beforeRoomId = freshMatch.room_id?.toString() ?? null;
                const roomId = await this.matchService.ensureRoomForMatch(tournament, freshMatch);
                const afterRoomId = roomId?.toString() ?? null;
                if (afterRoomId && afterRoomId !== beforeRoomId) {
                    this.logger.log(`event=tournament_room_repaired matchId=${freshMatch._id.toString()} roomId=${afterRoomId}`);
                    void this.tournamentsGateway.emitMatchUpdate(tid);
                }
            });
        }
    }
    async activatePendingFinalsMatches() {
        const finalsRunning = await this.tournamentModel.find({
            status: tournament_constants_1.TournamentStatus.FINALS_RUNNING,
            current_phase: tournament_constants_1.TournamentPhase.FINALS,
        });
        for (const t of finalsRunning) {
            const pending = await this.matchModel.countDocuments({
                tournament_id: t._id,
                round_index: t.current_round_index,
                status: tournament_constants_1.TournamentMatchStatus.PENDING,
                player_a_user_id: { $exists: true, $ne: null },
                player_b_user_id: { $exists: true, $ne: null },
            });
            if (pending === 0)
                continue;
            await this.withLock(t._id.toString(), async () => {
                const fresh = await this.tournamentModel.findById(t._id);
                if (!fresh || fresh.status !== tournament_constants_1.TournamentStatus.FINALS_RUNNING)
                    return;
                const stillPending = await this.matchModel.countDocuments({
                    tournament_id: fresh._id,
                    round_index: fresh.current_round_index,
                    status: tournament_constants_1.TournamentMatchStatus.PENDING,
                    player_a_user_id: { $exists: true, $ne: null },
                    player_b_user_id: { $exists: true, $ne: null },
                });
                if (stillPending === 0)
                    return;
                this.logger.log(`event=tournament_finals_activated tournament=${fresh._id.toString()} round=${fresh.current_round_index} pending=${stillPending}`);
                await this.matchService.activateRoundMatches(fresh, fresh.current_round_index);
                void this.tournamentsGateway.emitMatchUpdate(fresh._id.toString());
            });
        }
    }
};
exports.TournamentSchedulerService = TournamentSchedulerService;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_SECOND),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TournamentSchedulerService.prototype, "tick", null);
exports.TournamentSchedulerService = TournamentSchedulerService = TournamentSchedulerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(tournament_schema_1.Tournament.name)),
    __param(1, (0, mongoose_1.InjectModel)(tournament_participant_schema_1.TournamentParticipant.name)),
    __param(2, (0, mongoose_1.InjectModel)(tournament_match_schema_1.TournamentMatch.name)),
    __param(3, (0, mongoose_1.InjectModel)(room_schema_1.Room.name)),
    __param(7, (0, common_2.Inject)(redis_module_1.REDIS_CLIENT)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        tournament_bracket_service_1.TournamentBracketService,
        tournament_match_service_1.TournamentMatchService,
        tournament_ledger_service_1.TournamentLedgerService, Object, tournaments_gateway_1.TournamentsGateway])
], TournamentSchedulerService);
//# sourceMappingURL=tournament-scheduler.service.js.map