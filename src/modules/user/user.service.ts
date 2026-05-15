import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { UserRepository } from './user.repository';
import { BusinessException } from '../../common/exceptions/business.exception';
import { winnerDisplayedPrize } from '../../common/utils/game-prize.util';
import { WalletService } from '../wallet/wallet.service';
import { EmailService } from '../../common/email/email.service';
import { WalletChangePending, WalletChangePendingDocument } from './schemas/wallet-change-pending.schema';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly userRepo: UserRepository,
    @InjectModel('AppConfig') private readonly appConfigModel: Model<any>,
    @InjectModel('Room') private readonly roomModel: Model<any>,
    @InjectModel(WalletChangePending.name)
    private readonly walletChangePendingModel: Model<WalletChangePendingDocument>,
    private readonly walletService: WalletService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
  ) {}

  async getProfile(userId: string): Promise<any> {
    const user = await this.userRepo.findByIdSelect(userId, '-created_at');
    if (!user) throw new BusinessException('ERROR_USER_NOTFOUND', 404);

    let withdrawal_daily_limit = 10000;
    try {
      const config = await this.appConfigModel.findOne({ key: 'global' }).lean();
      if (config) withdrawal_daily_limit = (config as any).withdrawal_daily_limit ?? 10000;
    } catch {
      /* use default */
    }

    const profile = user as any;
    profile.limits = { daily_withdrawal: withdrawal_daily_limit };
    return profile;
  }

  async getHistory(userId: string, lang = 'en'): Promise<any[]> {
    const rooms = await this.roomModel
      .find({ status: 'finished', 'players.playerId': new Types.ObjectId(userId) })
      .populate('game_id', 'name socket_code')
      .populate('players.playerId', 'username')
      .populate('winner', 'username')
      .sort({ finished_at: -1 })
      .lean();

    return rooms.map((room: any) => {
      const isWinner = room.winner && room.winner._id.toString() === userId;
      const isDraw =
        !room.winner &&
        room.status === 'finished' &&
        ['stalemate', 'insufficient_material', 'draw'].includes(room.winner_reason);

      let prize: number | null = null;
      let resultKey = 'lose';
      const playerCount = Array.isArray(room.players) ? room.players.length : 2;
      if (isWinner) {
        prize = winnerDisplayedPrize(room.bet_amount, room.house_edge, playerCount);
        resultKey = 'win';
      } else if (isDraw) {
        prize = 0;
        resultKey = 'draw';
      }

      const opponent = room.players.find((p: any) => p.playerId?._id?.toString() !== userId);

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

  async registerUser(email: string, username: string, referred_by?: string): Promise<void> {
    const existing = await this.userRepo.findByEmail(email.toLowerCase());
    if (existing) throw new BusinessException('user.exist', 400);
    const normalized = username.trim().slice(0, 20);
    await this.userRepo.create({
      email: email.toLowerCase(),
      username: normalized,
      referred_by,
      status: 'active',
    } as any);
  }

  async verifyCode(email: string, verification_code: string): Promise<void> {
    // Stub: verifyCode flow not fully implemented in this migration
    throw new BusinessException('ERROR_VERIFICATIONCODE_RESPONSE', 400);
  }

  /**
   * Sends an OTP to the user's email and stores the pending address server-side.
   * The wallet is only persisted after successful `confirmWalletChangeWithOtp`.
   */
  async requestWalletChange(
    userId: string,
    coin: string,
    network: string,
    wallet: string,
    expiryMins: number,
    lang = 'en',
  ): Promise<void> {
    const trimmed = wallet?.trim() ?? '';
    if (!trimmed) throw new BusinessException('wallet.required', 400);

    const user = await this.userRepo.findById(userId);
    if (!user) throw new BusinessException('ERROR_USER_NOTFOUND', 404);

    const coinUpper = coin.toUpperCase();
    const walletConfig = await this.walletService.findByCoinAndNetwork(coinUpper, network);
    if (!walletConfig) throw new BusinessException('ERROR_WALLET_NOT_CONFIGURED', 400);

    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedCode = await bcrypt.hash(verificationCode, 10);
    const verification_expires_at = new Date(Date.now() + expiryMins * 60 * 1000);

    await this.walletChangePendingModel.findOneAndUpdate(
      { user_id: new Types.ObjectId(userId) },
      {
        $set: {
          user_id: new Types.ObjectId(userId),
          coin: coinUpper,
          network,
          wallet: trimmed,
          verification_code: hashedCode,
          verification_expires_at,
        },
      },
      { upsert: true, new: true },
    );

    await this.emailService.sendWalletChangeVerification(
      user.email,
      user.username,
      verificationCode,
      expiryMins,
      lang,
    );

    this.logger.log(`Wallet change OTP requested for user ${userId}`);
  }

  /** Applies the pending wallet address after OTP verification. */
  async confirmWalletChangeWithOtp(userId: string, verification_code: string): Promise<void> {
    const pending = await this.walletChangePendingModel
      .findOne({ user_id: new Types.ObjectId(userId) })
      .lean();

    if (!pending) {
      throw new BusinessException('ERROR_WALLET_CHANGE_NONE_PENDING', 400);
    }

    const isMatch = await bcrypt.compare(verification_code, pending.verification_code);
    if (!isMatch) {
      throw new BusinessException('ERROR_WALLET_CHANGE_CODE_INVALID', 400);
    }

    if (new Date() > pending.verification_expires_at) {
      await this.walletChangePendingModel.deleteOne({ _id: pending._id });
      throw new BusinessException('ERROR_WALLET_CHANGE_EXPIRED', 400);
    }

    const walletConfig = await this.walletService.findByCoinAndNetwork(
      pending.coin,
      pending.network,
    );
    if (!walletConfig) {
      await this.walletChangePendingModel.deleteOne({ _id: pending._id });
      throw new BusinessException('ERROR_WALLET_NOT_CONFIGURED', 400);
    }

    const updated = await this.userRepo.updateById(userId, {
      wallet_address: {
        coin: pending.coin,
        network: pending.network,
        wallet: pending.wallet,
      },
    });
    if (!updated) throw new BusinessException('ERROR_USER_NOTFOUND', 404);

    await this.walletChangePendingModel.deleteOne({ _id: pending._id });
  }

  async updateProfile(userId: string, update: { username?: string }): Promise<any> {
    const payload = { ...update };
    if (payload.username !== undefined) {
      payload.username = payload.username.trim().slice(0, 20);
    }
    const user = await this.userRepo.updateById(userId, payload);
    if (!user) throw new BusinessException('ERROR_USER_NOTFOUND', 404);
    return user;
  }

  async getTotalBalances(): Promise<any> {
    return this.userRepo.getTotalBalances();
  }

  /** Uncached count for the public login page — rate-limited at the controller. */
  async getPublicUserStats(): Promise<{ registeredUsers: number }> {
    const registeredUsers = await this.userRepo.countRegisteredUsers();
    return { registeredUsers };
  }
}
