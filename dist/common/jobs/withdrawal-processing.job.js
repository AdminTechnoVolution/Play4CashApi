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
var WithdrawalProcessingJob_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WithdrawalProcessingJob = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const config_1 = require("@nestjs/config");
const common_2 = require("@nestjs/common");
const redis_module_1 = require("../redis/redis.module");
const binance_client_1 = require("../clients/binance.client");
const i18n_service_1 = require("../i18n/i18n.service");
const decimal_js_1 = __importDefault(require("decimal.js"));
const JOB_LOCK_KEY = 'job:withdrawal-processing';
const JOB_LOCK_TTL_SECS = 55;
const SUCCESS_BINANCE_WITHDRAWAL = 6;
const REJECTED_BINANCE_WITHDRAWAL = 3;
let WithdrawalProcessingJob = WithdrawalProcessingJob_1 = class WithdrawalProcessingJob {
    withdrawalModel;
    userModel;
    txMessageModel;
    config;
    i18n;
    redis;
    logger = new common_1.Logger(WithdrawalProcessingJob_1.name);
    constructor(withdrawalModel, userModel, txMessageModel, config, i18n, redis) {
        this.withdrawalModel = withdrawalModel;
        this.userModel = userModel;
        this.txMessageModel = txMessageModel;
        this.config = config;
        this.i18n = i18n;
        this.redis = redis;
    }
    async handleCron() {
        this.logger.log('Withdrawal Processing Job: Starting instance...');
        const lock = await this.redis.set(JOB_LOCK_KEY, '1', {
            NX: true,
            EX: JOB_LOCK_TTL_SECS,
        });
        if (!lock) {
            this.logger.log('Withdrawal Processing Job: Skipped — another instance holds the lock');
            return;
        }
        this.logger.log('Withdrawal Processing Job: Starting instance...');
        try {
            await this.processWithdrawals();
        }
        catch (err) {
            this.logger.error(`Withdrawal Processing Job: Critical error: ${err.message}`);
        }
        finally {
            this.logger.log('Withdrawal Processing Job: Instance finished.');
            await this.redis.del(JOB_LOCK_KEY);
        }
    }
    async processWithdrawals() {
        const withdrawals = await this.withdrawalModel
            .find({ status: 'processing' })
            .lean();
        if (!withdrawals.length) {
            this.logger.debug('No withdrawals in "processing" status found.');
            return;
        }
        this.logger.log(`Checking ${withdrawals.length} withdrawals in status "processing"`);
        const idList = withdrawals.map((w) => w.id_binance).join(',');
        this.logger.log(`Fetching Binance history for IDs: ${idList}`);
        let binanceHistory = [];
        try {
            binanceHistory = await (0, binance_client_1.getWithdrawalHistory)({ idList });
        }
        catch (err) {
            this.logger.error(`Failed to fetch Binance history: ${err.message}`);
            return;
        }
        for (const withdrawal of withdrawals) {
            try {
                const binanceRecord = binanceHistory?.find((h) => h.id === withdrawal.id_binance);
                if (!binanceRecord) {
                    this.logger.warn(`Binance record not found for withdrawal ${withdrawal._id} (Binance ID: ${withdrawal.id_binance})`);
                    continue;
                }
                this.logger.log(`Processing withdrawal ${withdrawal._id}. Binance status: ${binanceRecord.status}`);
                if (binanceRecord.status === SUCCESS_BINANCE_WITHDRAWAL) {
                    await this.confirmWithdrawal(withdrawal, binanceRecord);
                }
                else if (binanceRecord.status === REJECTED_BINANCE_WITHDRAWAL) {
                    await this.rejectWithdrawal(withdrawal, binanceRecord);
                }
                else {
                    await this.logOtherStatus(withdrawal, binanceRecord);
                }
            }
            catch (err) {
                this.logger.error(`Error processing withdrawal ${withdrawal._id}: ${err.message}`);
            }
        }
    }
    async confirmWithdrawal(withdrawal, binanceWithdrawal) {
        const user = await this.userModel.findById(withdrawal.user_id);
        if (!user) {
            this.logger.error(`User ${withdrawal.user_id} not found for withdrawal ${withdrawal._id}`);
            return;
        }
        const newTotalWithdrawn = new decimal_js_1.default(user.total_witdrawal || 0)
            .plus(withdrawal.amount)
            .toNumber();
        await this.userModel.findByIdAndUpdate(withdrawal.user_id, {
            total_witdrawal: newTotalWithdrawn,
        });
        const updateData = {
            status: 'confirmed',
            txId: binanceWithdrawal.txId,
            tx_fee: new decimal_js_1.default(withdrawal.amount)
                .minus(binanceWithdrawal.amount)
                .toNumber(),
            amount: binanceWithdrawal.amount,
            confirmed_at: new Date(),
            confirmed_at_binance: binanceWithdrawal.completeTime
                ? new Date(binanceWithdrawal.completeTime)
                : new Date(),
            transfer_type: binanceWithdrawal.transferType === 1 ? 'internal' : 'external',
            wallet_type: binanceWithdrawal.walletType === 1 ? 'funding' : 'spot',
        };
        await this.withdrawalModel.findByIdAndUpdate(withdrawal._id, updateData);
        const message = this.i18n.translate('message_tx.confirmed.ok');
        await this.txMessageModel.create({
            user_id: withdrawal.user_id,
            txId: binanceWithdrawal.txId,
            amount: binanceWithdrawal.amount,
            coin: withdrawal.coin,
            wallet: withdrawal.wallet,
            txType: 'withdrawal',
            message: message,
        });
        this.logger.log(`Withdrawal ${withdrawal._id} confirmed successfully. TxId: ${binanceWithdrawal.txId}`);
    }
    async rejectWithdrawal(withdrawal, binanceWithdrawal) {
        await this.userModel.findByIdAndUpdate(withdrawal.user_id, {
            $inc: { balance: withdrawal.amount },
        });
        await this.withdrawalModel.deleteOne({ _id: withdrawal._id });
        const message = this.i18n.translate('message_tx.rejected');
        await this.txMessageModel.create({
            user_id: withdrawal.user_id,
            txId: binanceWithdrawal.txId || 'N/A',
            amount: withdrawal.amount,
            coin: withdrawal.coin,
            wallet: withdrawal.wallet,
            txType: 'withdrawal',
            message: message,
        });
        this.logger.warn(`Withdrawal ${withdrawal._id} rejected by Binance and refunded. Records updated.`);
    }
    async logOtherStatus(withdrawal, binanceWithdrawal) {
        const message = this.i18n.translate('message_tx.otherstatus') + binanceWithdrawal.status;
        await this.txMessageModel.create({
            user_id: withdrawal.user_id,
            txId: binanceWithdrawal.txId || 'N/A',
            amount: withdrawal.amount,
            coin: withdrawal.coin,
            wallet: withdrawal.wallet,
            txType: 'withdrawal',
            message: message,
        });
        this.logger.debug(`Withdrawal ${withdrawal._id} still in status ${binanceWithdrawal.status} on Binance. Transaction message recorded.`);
    }
};
exports.WithdrawalProcessingJob = WithdrawalProcessingJob;
__decorate([
    (0, schedule_1.Cron)(process.env.JOB_CRON_WITHDRAWAL_IN_PROCESSING || '*/10 * * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], WithdrawalProcessingJob.prototype, "handleCron", null);
exports.WithdrawalProcessingJob = WithdrawalProcessingJob = WithdrawalProcessingJob_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)('Withdrawal')),
    __param(1, (0, mongoose_1.InjectModel)('User')),
    __param(2, (0, mongoose_1.InjectModel)('TxMessage')),
    __param(5, (0, common_2.Inject)(redis_module_1.REDIS_CLIENT)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        config_1.ConfigService,
        i18n_service_1.I18nService, Object])
], WithdrawalProcessingJob);
//# sourceMappingURL=withdrawal-processing.job.js.map