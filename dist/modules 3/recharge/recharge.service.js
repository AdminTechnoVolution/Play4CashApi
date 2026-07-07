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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var RechargeService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RechargeService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const recharge_schema_1 = require("./schemas/recharge.schema");
const business_exception_1 = require("../../common/exceptions/business.exception");
const binance_client_1 = require("../../common/clients/binance.client");
const decimal_js_1 = __importDefault(require("decimal.js"));
let RechargeService = RechargeService_1 = class RechargeService {
    rechargeModel;
    userModel;
    txMessageModel;
    logger = new common_1.Logger(RechargeService_1.name);
    constructor(rechargeModel, userModel, txMessageModel) {
        this.rechargeModel = rechargeModel;
        this.userModel = userModel;
        this.txMessageModel = txMessageModel;
    }
    async createRecharge(userId, txId, coin, amount, processingExpiryMins) {
        const time_processing_expires_at = new Date(Date.now() + processingExpiryMins * 60 * 1000);
        const existing = await this.rechargeModel.findOne({ txId });
        if (existing) {
            throw new business_exception_1.BusinessException(existing.status === 'confirmed' ? 'WARNING_TX_CONFIRMED' : 'WARNING_TX_IN_PROCESS', 400);
        }
        const recharge = await this.rechargeModel.create({
            user_id: new mongoose_2.Types.ObjectId(userId),
            txId,
            coin: coin.toUpperCase(),
            amount,
            time_processing_expires_at,
        });
        let deposit;
        try {
            const deposits = await (0, binance_client_1.getDepositHistory)({ coin: recharge.coin });
            deposit = deposits.find((d) => d.txId === txId);
            if (!deposit)
                throw new Error('TX not found in Binance');
            if (!new decimal_js_1.default(deposit.amount).equals(new decimal_js_1.default(amount)))
                throw new Error('Amount mismatch');
            if (deposit.coin?.toUpperCase() !== coin.toUpperCase())
                throw new Error('Coin mismatch');
            if (![1, 6].includes(deposit.status))
                throw new Error(`Unexpected status: ${deposit.status}`);
        }
        catch (err) {
            this.logger.error(`Binance validation failed: ${err}`);
            await this.rechargeModel.deleteOne({ _id: recharge._id });
            await this.saveTxMessage(userId, txId, amount, coin, String(err));
            throw new business_exception_1.BusinessException('WARNING_TX_NOT_FOUND', 400);
        }
        const user = await this.userModel.findByIdAndUpdate(userId, {
            $inc: {
                balance: amount,
                total_recharged: amount,
            },
        }, { returnDocument: 'after' });
        await this.rechargeModel.findByIdAndUpdate(recharge._id, {
            wallet: deposit.address,
            network: deposit.network,
            status: 'confirmed',
            time_processing_expires_at: undefined,
        });
        await this.saveTxMessage(userId, txId, amount, coin, 'Confirmed');
        return { balance: new decimal_js_1.default(user.balance).toNumber() };
    }
    async getHistory(userId) {
        return this.rechargeModel
            .find({ user_id: new mongoose_2.Types.ObjectId(userId) })
            .select('amount coin status wallet network txId created_at confirmed_at')
            .sort({ created_at: -1 })
            .lean();
    }
    async saveTxMessage(userId, txId, amount, coin, message) {
        try {
            await this.txMessageModel.create({ user_id: userId, txId, amount, coin, message, txType: 'recharge' });
        }
        catch (err) {
            this.logger.error(`Error saving tx message: ${err}`);
        }
    }
};
exports.RechargeService = RechargeService;
exports.RechargeService = RechargeService = RechargeService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(recharge_schema_1.Recharge.name)),
    __param(1, (0, mongoose_1.InjectModel)('User')),
    __param(2, (0, mongoose_1.InjectModel)('TxMessage')),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model])
], RechargeService);
//# sourceMappingURL=recharge.service.js.map