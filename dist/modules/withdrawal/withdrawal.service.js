"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var WithdrawalService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WithdrawalService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const decimal_js_1 = __importDefault(require("decimal.js"));
const bcrypt = __importStar(require("bcryptjs"));
const withdrawal_schema_1 = require("./schemas/withdrawal.schema");
const business_exception_1 = require("../../common/exceptions/business.exception");
const binance_client_1 = require("../../common/clients/binance.client");
const wallet_service_1 = require("../wallet/wallet.service");
const app_config_service_1 = require("../app-config/app-config.service");
const email_service_1 = require("../../common/email/email.service");
let WithdrawalService = WithdrawalService_1 = class WithdrawalService {
    withdrawalModel;
    userModel;
    txMessageModel;
    walletService;
    appConfigService;
    emailService;
    logger = new common_1.Logger(WithdrawalService_1.name);
    constructor(withdrawalModel, userModel, txMessageModel, walletService, appConfigService, emailService) {
        this.withdrawalModel = withdrawalModel;
        this.userModel = userModel;
        this.txMessageModel = txMessageModel;
        this.walletService = walletService;
        this.appConfigService = appConfigService;
        this.emailService = emailService;
    }
    async processWithdrawal(userId, verification_code) {
        const pendingWithdrawal = await this.withdrawalModel.findOne({
            user_id: new mongoose_2.Types.ObjectId(userId),
            status: 'pending_verify',
        });
        if (!pendingWithdrawal) {
            const msg = 'The verification code is invalid or has expired';
            throw new business_exception_1.BusinessException('ERROR_WITHDRAWAL_CODE_INVALID', 400);
        }
        const { amount, coin, wallet, network } = pendingWithdrawal;
        const isMatch = await bcrypt.compare(verification_code, pendingWithdrawal.verification_code);
        if (!isMatch) {
            const msg = 'Error: verification code invalid or expired';
            await this.saveTxMessage(userId, amount, coin, wallet, msg);
            throw new business_exception_1.BusinessException('ERROR_WITHDRAWAL_CODE_INVALID', 400);
        }
        if (new Date() > pendingWithdrawal.verification_expires_at) {
            const msg = 'Error: verification code invalid or expired';
            await this.saveTxMessage(userId, amount, coin, wallet, msg);
            throw new business_exception_1.BusinessException('ERROR_WITHDRAWAL_CODE_EXPIRED', 400);
        }
        const walletConfig = await this.walletService.findByCoinAndNetwork(coin, network);
        if (!walletConfig)
            throw new business_exception_1.BusinessException('ERROR_WALLET_NOT_CONFIGURED', 400);
        if (amount < walletConfig.minAmount) {
            const msg = 'Error: transaction amount below minimum required';
            await this.saveTxMessage(userId, amount, coin, wallet, msg);
            throw new business_exception_1.BusinessException('ERROR_WITHDRAWAL_AMOUNT_MINIMUM', 400);
        }
        const user = await this.userModel.findOneAndUpdate({ _id: new mongoose_2.Types.ObjectId(userId), balance: { $gte: amount } }, { $inc: { balance: -amount, total_witdrawal: amount } }, { returnDocument: 'after' });
        if (!user) {
            const msg = 'Error: insufficient funds for transaction';
            await this.saveTxMessage(userId, amount, coin, wallet, msg);
            throw new business_exception_1.BusinessException('ERROR_WITHDRAWAL_INSUFFICIENT_BALANCE', 400);
        }
        try {
            const binanceResult = await (0, binance_client_1.sendWithdrawalRequest)(coin, network, wallet, amount);
            await this.withdrawalModel.findByIdAndUpdate(pendingWithdrawal._id, {
                $set: {
                    status: 'processing',
                    id_binance: binanceResult.id,
                },
                $unset: {
                    verification_code: 1,
                    verification_expires_at: 1,
                },
            });
            await this.saveTxMessage(userId, amount, coin, wallet, 'Ok: transaction processing');
            return { balance: new decimal_js_1.default(user.balance).toNumber() };
        }
        catch (err) {
            await this.userModel.findByIdAndUpdate(userId, {
                $inc: { balance: amount, total_witdrawal: -amount },
            });
            const msg = typeof err === 'string' ? err : err.message || 'Error: transaction processing';
            await this.saveTxMessage(userId, amount, coin, wallet, msg);
            this.logger.error(`Binance withdrawal failed: ${err}`);
            throw new business_exception_1.BusinessException('ERROR_GENERIC_RESPONSE', 500);
        }
    }
    async initiateWithdrawal(userId, amount, verificationExpiryMins, lang = 'en') {
        const user = await this.userModel.findById(userId);
        if (!user)
            throw new business_exception_1.BusinessException('ERROR_USER_NOTFOUND', 404);
        if (!user.wallet_address || !user.wallet_address.coin || !user.wallet_address.wallet) {
            throw new business_exception_1.BusinessException('ERROR_USER_WALLET_NOTFOUND', 400);
        }
        const { coin, wallet: walletAddress, network } = user.wallet_address;
        const walletConfig = await this.walletService.findByCoinAndNetwork(coin, network);
        if (!walletConfig)
            throw new business_exception_1.BusinessException('ERROR_WALLET_NOT_CONFIGURED', 400);
        if (amount < walletConfig.minAmount) {
            const msg = 'Error: transaction amount below minimum required';
            await this.saveTxMessage(userId, amount, coin, walletAddress, msg);
            throw new business_exception_1.BusinessException('ERROR_WITHDRAWAL_AMOUNT_MINIMUM', 400);
        }
        const config = await this.appConfigService.getConfig();
        const limit = config.withdrawal_daily_limit;
        if (limit > 0) {
            const startOfDay = new Date();
            startOfDay.setUTCHours(0, 0, 0, 0);
            const todayWithdrawals = await this.withdrawalModel.aggregate([
                {
                    $match: {
                        user_id: new mongoose_2.Types.ObjectId(userId),
                        created_at: { $gte: startOfDay },
                        status: { $ne: 'failed' },
                    },
                },
                { $group: { _id: null, totalAmount: { $sum: '$amount' } } },
            ]);
            const totalToday = todayWithdrawals.length > 0 ? todayWithdrawals[0].totalAmount : 0;
            if (totalToday + amount > limit) {
                const msg = 'The daily withdrawal limit has been exceeded. Please try again tomorrow.';
                await this.saveTxMessage(userId, amount, coin, walletAddress, msg);
                throw new business_exception_1.BusinessException('ERROR_WITHDRAWAL_DAILY_LIMIT_EXCEEDED', 400);
            }
        }
        const foundWithdrawal = await this.withdrawalModel.findOne({
            user_id: new mongoose_2.Types.ObjectId(userId),
            status: 'pending_verify',
        });
        if (foundWithdrawal) {
            const msg = 'Error: transaction pending verification';
            await this.saveTxMessage(userId, amount, coin, walletAddress, msg);
            throw new business_exception_1.BusinessException('ERROR_WITHDRAWAL_PENDING_VERIFY', 400);
        }
        if (user.balance < amount) {
            const msg = 'Error: insufficient funds for transaction';
            await this.saveTxMessage(userId, amount, coin, walletAddress, msg);
            throw new business_exception_1.BusinessException('ERROR_WITHDRAWAL_INSUFFICIENT_BALANCE', 400);
        }
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        const hashedCode = await bcrypt.hash(verificationCode, 10);
        const verification_expires_at = new Date(Date.now() + verificationExpiryMins * 60 * 1000);
        await this.withdrawalModel.create({
            user_id: new mongoose_2.Types.ObjectId(userId),
            amount,
            coin: coin.toUpperCase(),
            wallet: walletAddress,
            network,
            tx_fee: walletConfig.networkWithdrawalFee || 0,
            verification_code: hashedCode,
            verification_expires_at,
        });
        await this.emailService.sendWithdrawalVerification(user.email, user.username, verificationCode, verificationExpiryMins, lang);
        this.logger.log(`Withdrawal initiated for user ${userId}`);
    }
    async saveTxMessage(user_id, amount, coin, wallet, message) {
        try {
            await this.txMessageModel.create({
                user_id: new mongoose_2.Types.ObjectId(user_id),
                amount,
                coin,
                message,
                wallet,
                txType: 'withdrawal',
            });
        }
        catch (err) {
            this.logger.error(`Error saving TxMessage: ${err}`);
        }
    }
    async getHistory(userId) {
        const list = await this.withdrawalModel
            .find({ user_id: new mongoose_2.Types.ObjectId(userId) })
            .select('amount coin status wallet network tx_fee txId created_at confirmed_at')
            .sort({ created_at: -1 })
            .lean();
        return list.map((w) => ({
            amount: w.amount,
            coin: w.coin,
            status: w.status,
            wallet: w.wallet,
            network: w.network,
            tx_fee: w.tx_fee || 0,
            txId: w.txId,
            created_at: w.created_at,
            confirmed_at: w.confirmed_at,
        }));
    }
};
exports.WithdrawalService = WithdrawalService;
exports.WithdrawalService = WithdrawalService = WithdrawalService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(withdrawal_schema_1.Withdrawal.name)),
    __param(1, (0, mongoose_1.InjectModel)('User')),
    __param(2, (0, mongoose_1.InjectModel)('TxMessage')),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        wallet_service_1.WalletService,
        app_config_service_1.AppConfigService,
        email_service_1.EmailService])
], WithdrawalService);
//# sourceMappingURL=withdrawal.service.js.map