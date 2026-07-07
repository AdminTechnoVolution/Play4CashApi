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
var TournamentRegistrationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TournamentRegistrationService = void 0;
const common_1 = require("@nestjs/common");
const tournaments_gateway_1 = require("../../websockets/tournaments/tournaments.gateway");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const idempotency_service_1 = require("../../../common/idempotency/idempotency.service");
const tournament_schema_1 = require("../schemas/tournament.schema");
const tournament_participant_schema_1 = require("../schemas/tournament-participant.schema");
const tournament_constants_1 = require("../constants/tournament.constants");
const tournament_ledger_service_1 = require("./tournament-ledger.service");
const user_schema_1 = require("../../user/schemas/user.schema");
let TournamentRegistrationService = class TournamentRegistrationService {
    static { TournamentRegistrationService_1 = this; }
    tournamentModel;
    participantModel;
    userModel;
    ledger;
    idempotency;
    tournamentsGateway;
    constructor(tournamentModel, participantModel, userModel, ledger, idempotency, tournamentsGateway) {
        this.tournamentModel = tournamentModel;
        this.participantModel = participantModel;
        this.userModel = userModel;
        this.ledger = ledger;
        this.idempotency = idempotency;
        this.tournamentsGateway = tournamentsGateway;
    }
    static UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    assertIdempotencyKey(key) {
        if (!key || !TournamentRegistrationService_1.UUID_RE.test(key.trim())) {
            throw new common_1.BadRequestException('Valid Idempotency-Key header required');
        }
        return key.trim();
    }
    async register(tournamentId, userId, idempotencyKeyHeader) {
        const idempKey = this.assertIdempotencyKey(idempotencyKeyHeader);
        const cacheKey = `idem:tournament:register:${userId}:${idempKey}`;
        return this.idempotency.getOrSet(cacheKey, idempotency_service_1.IdempotencyService.DEFAULT_TTL_SEC, async () => {
            const t = await this.tournamentModel.findById(tournamentId);
            if (!t)
                throw new common_1.NotFoundException('Tournament not found');
            if (t.status !== tournament_constants_1.TournamentStatus.OPEN && t.status !== tournament_constants_1.TournamentStatus.FULL) {
                throw new common_1.BadRequestException('Tournament not open for registration');
            }
            if (t.registered_count >= t.max_players) {
                throw new common_1.ConflictException('Tournament is full');
            }
            const existing = await this.participantModel.findOne({
                tournament_id: t._id,
                user_id: new mongoose_2.Types.ObjectId(userId),
            });
            if (existing) {
                return { registered: true, participantId: existing._id.toString(), alreadyRegistered: true };
            }
            const user = await this.userModel.findById(userId).select('username balance');
            if (!user)
                throw new common_1.NotFoundException('User not found');
            const txKey = `idem:tournament:reg-tx:${t._id}:${userId}:${idempKey}`;
            try {
                await this.ledger.debitRegistration(t._id, user._id, t.buy_in, txKey);
            }
            catch {
                throw new common_1.BadRequestException('Insufficient balance');
            }
            const seed = t.registered_count + 1;
            const groupNumber = ((seed - 1) % t.group_count) + 1;
            const participant = await this.participantModel.create({
                tournament_id: t._id,
                user_id: user._id,
                username: user.username,
                status: tournament_constants_1.TournamentParticipantStatus.REGISTERED,
                seed,
                group_number: groupNumber,
                registered_at: new Date(),
            });
            t.registered_count += 1;
            t.gross_prize_pool += t.buy_in;
            if (t.registered_count >= t.max_players) {
                t.status =
                    t.starts_at.getTime() > Date.now() ? tournament_constants_1.TournamentStatus.COUNTDOWN : tournament_constants_1.TournamentStatus.FULL;
            }
            await t.save();
            void this.tournamentsGateway.emitMatchUpdate(t._id.toString());
            return {
                registered: true,
                participantId: participant._id.toString(),
                seed,
                groupNumber,
                registeredCount: t.registered_count,
                status: t.status,
            };
        });
    }
    async unregister(tournamentId, userId, idempotencyKeyHeader) {
        const idempKey = this.assertIdempotencyKey(idempotencyKeyHeader);
        const cacheKey = `idem:tournament:unregister:${userId}:${idempKey}`;
        return this.idempotency.getOrSet(cacheKey, idempotency_service_1.IdempotencyService.DEFAULT_TTL_SEC, async () => {
            const t = await this.tournamentModel.findById(tournamentId);
            if (!t)
                throw new common_1.NotFoundException('Tournament not found');
            if (t.status !== tournament_constants_1.TournamentStatus.OPEN && t.status !== tournament_constants_1.TournamentStatus.FULL && t.status !== tournament_constants_1.TournamentStatus.COUNTDOWN) {
                throw new common_1.BadRequestException('Cannot unregister at this stage');
            }
            const participant = await this.participantModel.findOne({
                tournament_id: t._id,
                user_id: new mongoose_2.Types.ObjectId(userId),
            });
            if (!participant)
                throw new common_1.NotFoundException('Not registered');
            const txKey = `idem:tournament:unreg-tx:${t._id}:${userId}:${idempKey}`;
            await this.ledger.refundRegistration(t._id, participant.user_id, t.buy_in, txKey);
            participant.status = tournament_constants_1.TournamentParticipantStatus.REFUNDED;
            await participant.deleteOne();
            t.registered_count = Math.max(0, t.registered_count - 1);
            t.gross_prize_pool = Math.max(0, t.gross_prize_pool - t.buy_in);
            if (t.status === tournament_constants_1.TournamentStatus.FULL || t.status === tournament_constants_1.TournamentStatus.COUNTDOWN) {
                t.status = tournament_constants_1.TournamentStatus.OPEN;
            }
            await t.save();
            void this.tournamentsGateway.emitMatchUpdate(t._id.toString());
            return { unregistered: true, registeredCount: t.registered_count, status: t.status };
        });
    }
};
exports.TournamentRegistrationService = TournamentRegistrationService;
exports.TournamentRegistrationService = TournamentRegistrationService = TournamentRegistrationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(tournament_schema_1.Tournament.name)),
    __param(1, (0, mongoose_1.InjectModel)(tournament_participant_schema_1.TournamentParticipant.name)),
    __param(2, (0, mongoose_1.InjectModel)(user_schema_1.User.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        tournament_ledger_service_1.TournamentLedgerService,
        idempotency_service_1.IdempotencyService,
        tournaments_gateway_1.TournamentsGateway])
], TournamentRegistrationService);
//# sourceMappingURL=tournament-registration.service.js.map