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
var TournamentSettlementService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TournamentSettlementService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const tournament_schema_1 = require("../schemas/tournament.schema");
const tournament_participant_schema_1 = require("../schemas/tournament-participant.schema");
const tournament_constants_1 = require("../constants/tournament.constants");
const tournament_ledger_service_1 = require("./tournament-ledger.service");
const tournament_constants_2 = require("../constants/tournament.constants");
let TournamentSettlementService = TournamentSettlementService_1 = class TournamentSettlementService {
    tournamentModel;
    participantModel;
    ledger;
    logger = new common_1.Logger(TournamentSettlementService_1.name);
    constructor(tournamentModel, participantModel, ledger) {
        this.tournamentModel = tournamentModel;
        this.participantModel = participantModel;
        this.ledger = ledger;
    }
    async settle(tournament, winnerUserId, runnerUpUserId) {
        const updated = await this.tournamentModel.findOneAndUpdate({ _id: tournament._id, prizes_settled: { $ne: true }, status: { $ne: tournament_constants_1.TournamentStatus.FINISHED } }, {
            $set: {
                status: tournament_constants_1.TournamentStatus.FINISHED,
                prizes_settled: true,
                finished_at: new Date(),
                winner_user_id: winnerUserId,
                runner_up_user_id: runnerUpUserId,
            },
        }, { returnDocument: 'after' });
        if (!updated)
            return;
        const gross = updated.gross_prize_pool;
        const houseAmount = Math.round(gross * (updated.house_fee_percent / 100) * 100) / 100;
        const firstAmount = Math.round(gross * (updated.first_place_percent / 100) * 100) / 100;
        const secondAmount = Math.round((gross - houseAmount - firstAmount) * 100) / 100;
        updated.house_amount = houseAmount;
        updated.first_place_amount = firstAmount;
        updated.second_place_amount = secondAmount;
        await updated.save();
        const tid = updated._id;
        await this.ledger.recordHouseFee(tid, houseAmount, `idem:tournament:fee:house:${tid}`);
        await this.ledger.creditPrize(tid, winnerUserId, firstAmount, tournament_constants_2.TournamentTransactionType.FIRST_PLACE_PRIZE, `idem:tournament:prize:first:${tid}`);
        await this.ledger.creditPrize(tid, runnerUpUserId, secondAmount, tournament_constants_2.TournamentTransactionType.SECOND_PLACE_PRIZE, `idem:tournament:prize:second:${tid}`);
        await this.participantModel.updateOne({ tournament_id: tid, user_id: winnerUserId }, { $set: { status: tournament_constants_1.TournamentParticipantStatus.WINNER, final_rank: 1 } });
        await this.participantModel.updateOne({ tournament_id: tid, user_id: runnerUpUserId }, { $set: { status: tournament_constants_1.TournamentParticipantStatus.RUNNER_UP, final_rank: 2 } });
        this.logger.log(`event=tournament_settled tournament=${tid} gross=${gross}`);
    }
};
exports.TournamentSettlementService = TournamentSettlementService;
exports.TournamentSettlementService = TournamentSettlementService = TournamentSettlementService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(tournament_schema_1.Tournament.name)),
    __param(1, (0, mongoose_1.InjectModel)(tournament_participant_schema_1.TournamentParticipant.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model,
        tournament_ledger_service_1.TournamentLedgerService])
], TournamentSettlementService);
//# sourceMappingURL=tournament-settlement.service.js.map