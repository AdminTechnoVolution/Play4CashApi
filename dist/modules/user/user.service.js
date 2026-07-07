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
var UserService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const bcrypt = __importStar(require("bcryptjs"));
const user_repository_1 = require("./user.repository");
const business_exception_1 = require("../../common/exceptions/business.exception");
const game_prize_util_1 = require("../../common/utils/game-prize.util");
const wallet_service_1 = require("../wallet/wallet.service");
const email_service_1 = require("../../common/email/email.service");
const wallet_change_pending_schema_1 = require("./schemas/wallet-change-pending.schema");
let UserService = UserService_1 = class UserService {
    userRepo;
    appConfigModel;
    roomModel;
    walletChangePendingModel;
    walletService;
    emailService;
    config;
    logger = new common_1.Logger(UserService_1.name);
    constructor(userRepo, appConfigModel, roomModel, walletChangePendingModel, walletService, emailService, config) {
        this.userRepo = userRepo;
        this.appConfigModel = appConfigModel;
        this.roomModel = roomModel;
        this.walletChangePendingModel = walletChangePendingModel;
        this.walletService = walletService;
        this.emailService = emailService;
        this.config = config;
    }
    async getProfile(userId) {
        const user = await this.userRepo.findByIdSelect(userId, '-created_at');
        if (!user)
            throw new business_exception_1.BusinessException('ERROR_USER_NOTFOUND', 404);
        let withdrawal_daily_limit = 10000;
        try {
            const config = await this.appConfigModel.findOne({ key: 'global' }).lean();
            if (config)
                withdrawal_daily_limit = config.withdrawal_daily_limit ?? 10000;
        }
        catch {
        }
        const profile = user;
        profile.limits = { daily_withdrawal: withdrawal_daily_limit };
        return profile;
    }
    async getHistory(userId, lang = 'en') {
        const rooms = await this.roomModel
            .find({ status: 'finished', 'players.playerId': new mongoose_2.Types.ObjectId(userId) })
            .populate('game_id', 'name socket_code')
            .populate('players.playerId', 'username')
            .populate('winner', 'username')
            .sort({ finished_at: -1 })
            .lean();
        return rooms.map((room) => {
            const isWinner = room.winner && room.winner._id.toString() === userId;
            const isDraw = !room.winner &&
                room.status === 'finished' &&
                ['stalemate', 'insufficient_material', 'draw'].includes(room.winner_reason);
            let prize = null;
            let resultKey = 'lose';
            const playerCount = Array.isArray(room.players) ? room.players.length : 2;
            if (isWinner) {
                prize = (0, game_prize_util_1.winnerDisplayedPrize)(room.bet_amount, room.house_edge, playerCount);
                resultKey = 'win';
            }
            else if (isDraw) {
                prize = 0;
                resultKey = 'draw';
            }
            const opponent = room.players.find((p) => p.playerId?._id?.toString() !== userId);
            let gameName = 'Unknown';
            if (room.game_id?.name) {
                gameName =
                    room.game_id.name[lang] ||
                        room.game_id.name['en'] ||
                        room.game_id.name['es'] ||
                        'Unknown';
            }
            const reason = room.winner_reason || (isWinner ? 'win' : isDraw ? 'draw' : 'forfeit');
            return {
                room_id: room._id,
                room_code: room.code,
                game_name: gameName,
                game_code: room.game_id?.socket_code || 'unknown',
                bet_amount: room.bet_amount,
                result: resultKey,
                prize,
                winner_reason: reason,
                opponent: opponent ? { username: opponent.playerId?.username } : null,
                finished_at: room.finished_at,
                date: room.finished_at,
            };
        });
    }
    async registerUser(email, username, referred_by) {
        const existing = await this.userRepo.findByEmail(email.toLowerCase());
        if (existing)
            throw new business_exception_1.BusinessException('user.exist', 400);
        const normalized = username.trim().slice(0, 20);
        await this.userRepo.create({
            email: email.toLowerCase(),
            username: normalized,
            referred_by,
            status: 'active',
        });
    }
    async verifyCode(email, verification_code) {
        throw new business_exception_1.BusinessException('ERROR_VERIFICATIONCODE_RESPONSE', 400);
    }
    async requestWalletChange(userId, coin, network, wallet, expiryMins, lang = 'en') {
        const trimmed = wallet?.trim() ?? '';
        if (!trimmed)
            throw new business_exception_1.BusinessException('wallet.required', 400);
        const user = await this.userRepo.findById(userId);
        if (!user)
            throw new business_exception_1.BusinessException('ERROR_USER_NOTFOUND', 404);
        const coinUpper = coin.toUpperCase();
        const walletConfig = await this.walletService.findByCoinAndNetwork(coinUpper, network);
        if (!walletConfig)
            throw new business_exception_1.BusinessException('ERROR_WALLET_NOT_CONFIGURED', 400);
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        const hashedCode = await bcrypt.hash(verificationCode, 10);
        const verification_expires_at = new Date(Date.now() + expiryMins * 60 * 1000);
        await this.walletChangePendingModel.findOneAndUpdate({ user_id: new mongoose_2.Types.ObjectId(userId) }, {
            $set: {
                user_id: new mongoose_2.Types.ObjectId(userId),
                coin: coinUpper,
                network,
                wallet: trimmed,
                verification_code: hashedCode,
                verification_expires_at,
            },
        }, { upsert: true, new: true });
        await this.emailService.sendWalletChangeVerification(user.email, user.username, verificationCode, expiryMins, lang);
        this.logger.log(`Wallet change OTP requested for user ${userId}`);
    }
    async confirmWalletChangeWithOtp(userId, verification_code) {
        const pending = await this.walletChangePendingModel
            .findOne({ user_id: new mongoose_2.Types.ObjectId(userId) })
            .lean();
        if (!pending) {
            throw new business_exception_1.BusinessException('ERROR_WALLET_CHANGE_NONE_PENDING', 400);
        }
        const isMatch = await bcrypt.compare(verification_code, pending.verification_code);
        if (!isMatch) {
            throw new business_exception_1.BusinessException('ERROR_WALLET_CHANGE_CODE_INVALID', 400);
        }
        if (new Date() > pending.verification_expires_at) {
            await this.walletChangePendingModel.deleteOne({ _id: pending._id });
            throw new business_exception_1.BusinessException('ERROR_WALLET_CHANGE_EXPIRED', 400);
        }
        const walletConfig = await this.walletService.findByCoinAndNetwork(pending.coin, pending.network);
        if (!walletConfig) {
            await this.walletChangePendingModel.deleteOne({ _id: pending._id });
            throw new business_exception_1.BusinessException('ERROR_WALLET_NOT_CONFIGURED', 400);
        }
        const updated = await this.userRepo.updateById(userId, {
            wallet_address: {
                coin: pending.coin,
                network: pending.network,
                wallet: pending.wallet,
            },
        });
        if (!updated)
            throw new business_exception_1.BusinessException('ERROR_USER_NOTFOUND', 404);
        await this.walletChangePendingModel.deleteOne({ _id: pending._id });
    }
    async updateProfile(userId, update) {
        const payload = { ...update };
        if (payload.username !== undefined) {
            payload.username = payload.username.trim().slice(0, 20);
        }
        const user = await this.userRepo.updateById(userId, payload);
        if (!user)
            throw new business_exception_1.BusinessException('ERROR_USER_NOTFOUND', 404);
        return user;
    }
    async getTotalBalances() {
        return this.userRepo.getTotalBalances();
    }
    async getPublicUserStats() {
        const registeredUsers = await this.userRepo.countRegisteredUsers();
        return { registeredUsers };
    }
    async savePushSubscription(userId, sub) {
        await this.userRepo.upsertPushSubscription(userId, sub);
    }
    async removePushSubscription(userId, endpoint) {
        await this.userRepo.removePushSubscription(userId, endpoint);
    }
};
exports.UserService = UserService;
exports.UserService = UserService = UserService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, mongoose_1.InjectModel)('AppConfig')),
    __param(2, (0, mongoose_1.InjectModel)('Room')),
    __param(3, (0, mongoose_1.InjectModel)(wallet_change_pending_schema_1.WalletChangePending.name)),
    __metadata("design:paramtypes", [user_repository_1.UserRepository,
        mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        wallet_service_1.WalletService,
        email_service_1.EmailService,
        config_1.ConfigService])
], UserService);
//# sourceMappingURL=user.service.js.map