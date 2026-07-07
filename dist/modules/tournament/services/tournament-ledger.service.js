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
var TournamentLedgerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TournamentLedgerService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const tournament_transaction_schema_1 = require("../schemas/tournament-transaction.schema");
const tournament_constants_1 = require("../constants/tournament.constants");
const user_schema_1 = require("../../user/schemas/user.schema");
let TournamentLedgerService = TournamentLedgerService_1 = class TournamentLedgerService {
    txModel;
    userModel;
    logger = new common_1.Logger(TournamentLedgerService_1.name);
    constructor(txModel, userModel) {
        this.txModel = txModel;
        this.userModel = userModel;
    }
    async debitRegistration(tournamentId, userId, amount, idempotencyKey) {
        const existing = await this.txModel.findOne({ idempotency_key: idempotencyKey });
        if (existing)
            return;
        const updated = await this.userModel.findOneAndUpdate({ _id: userId, balance: { $gte: amount } }, { $inc: { balance: -amount } }, { returnDocument: 'after' });
        if (!updated) {
            throw new Error('INSUFFICIENT_BALANCE');
        }
        await this.txModel.create({
            tournament_id: tournamentId,
            user_id: userId,
            type: tournament_constants_1.TournamentTransactionType.REGISTRATION_DEBIT,
            amount: -amount,
            status: 'completed',
            idempotency_key: idempotencyKey,
            reference: 'registration',
        });
    }
    async refundRegistration(tournamentId, userId, amount, idempotencyKey) {
        const existing = await this.txModel.findOne({ idempotency_key: idempotencyKey });
        if (existing)
            return;
        await this.userModel.updateOne({ _id: userId }, { $inc: { balance: amount } });
        await this.txModel.create({
            tournament_id: tournamentId,
            user_id: userId,
            type: tournament_constants_1.TournamentTransactionType.REGISTRATION_REFUND,
            amount,
            status: 'completed',
            idempotency_key: idempotencyKey,
            reference: 'refund',
        });
    }
    async creditPrize(tournamentId, userId, amount, type, idempotencyKey) {
        const existing = await this.txModel.findOne({ idempotency_key: idempotencyKey });
        if (existing)
            return;
        await this.userModel.updateOne({ _id: userId }, { $inc: { balance: amount } });
        await this.txModel.create({
            tournament_id: tournamentId,
            user_id: userId,
            type,
            amount,
            status: 'completed',
            idempotency_key: idempotencyKey,
            reference: type,
        });
    }
    async recordHouseFee(tournamentId, amount, idempotencyKey) {
        const existing = await this.txModel.findOne({ idempotency_key: idempotencyKey });
        if (existing)
            return;
        await this.txModel.create({
            tournament_id: tournamentId,
            type: tournament_constants_1.TournamentTransactionType.HOUSE_FEE,
            amount,
            status: 'completed',
            idempotency_key: idempotencyKey,
            reference: 'house_fee',
        });
    }
    async refundAllRegistered(tournamentId, participants) {
        for (const p of participants) {
            const key = `idem:tournament:refund:${tournamentId}:${p.user_id}`;
            try {
                await this.refundRegistration(tournamentId, p.user_id, p.amount, key);
            }
            catch (e) {
                this.logger.warn(`event=tournament_refund_skip user=${p.user_id} err=${e.message}`);
            }
        }
    }
};
exports.TournamentLedgerService = TournamentLedgerService;
exports.TournamentLedgerService = TournamentLedgerService = TournamentLedgerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(tournament_transaction_schema_1.TournamentTransaction.name)),
    __param(1, (0, mongoose_1.InjectModel)(user_schema_1.User.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model])
], TournamentLedgerService);
//# sourceMappingURL=tournament-ledger.service.js.map