import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import Decimal from 'decimal.js';
import * as bcrypt from 'bcryptjs';
import { Withdrawal, WithdrawalDocument } from './schemas/withdrawal.schema';
import { BusinessException } from '../../common/exceptions/business.exception';
import { sendWithdrawalRequest } from '../../common/clients/binance.client';
import { WalletService } from '../wallet/wallet.service';
import { AppConfigService } from '../app-config/app-config.service';
import { EmailService } from '../../common/email/email.service';
import { TtlCache } from '../../common/ttl-cache';

@Injectable()
export class WithdrawalService {
  private readonly logger = new Logger(WithdrawalService.name);
  private readonly historyCache = new TtlCache<any[]>();

  constructor(
    @InjectModel(Withdrawal.name) private readonly withdrawalModel: Model<WithdrawalDocument>,
    @InjectModel('User') private readonly userModel: Model<any>,
    @InjectModel('TxMessage') private readonly txMessageModel: Model<any>,
    private readonly walletService: WalletService,
    private readonly appConfigService: AppConfigService,
    private readonly emailService: EmailService,
  ) {}

  async processWithdrawal(
    userId: string,
    verification_code: string,
  ): Promise<{ balance: number }> {
    this.historyCache.delete(`withdrawal-history:${userId}`);
    // Verify the pending withdrawal exists
    const pendingWithdrawal = await this.withdrawalModel.findOne({
      user_id: new Types.ObjectId(userId),
      status: 'pending_verify',
    });

    if (!pendingWithdrawal) {
      const msg = 'The verification code is invalid or has expired';
      // Note: We don't have amount/coin/wallet here if the record doesn't exist,
      // but we can log a generic message.
      throw new BusinessException('ERROR_WITHDRAWAL_CODE_INVALID', 400);
    }

    const { amount, coin, wallet, network } = pendingWithdrawal;

    // Verify code via bcrypt
    const isMatch = await bcrypt.compare(verification_code, pendingWithdrawal.verification_code);
    if (!isMatch) {
      const msg = 'Error: verification code invalid or expired';
      await this.saveTxMessage(userId, amount, coin, wallet, msg);
      throw new BusinessException('ERROR_WITHDRAWAL_CODE_INVALID', 400);
    }

    // Verify expiry
    if (new Date() > pendingWithdrawal.verification_expires_at) {
      const msg = 'Error: verification code invalid or expired';
      await this.saveTxMessage(userId, amount, coin, wallet, msg);
      throw new BusinessException('ERROR_WITHDRAWAL_CODE_EXPIRED', 400);
    }

    // Verify wallet config (min amount)
    const walletConfig = await this.walletService.findByCoinAndNetwork(coin, network);
    if (!walletConfig) throw new BusinessException('ERROR_WALLET_NOT_CONFIGURED', 400);
    if (amount < walletConfig.minAmount) {
      const msg = 'Error: transaction amount below minimum required';
      await this.saveTxMessage(userId, amount, coin, wallet, msg);
      throw new BusinessException('ERROR_WITHDRAWAL_AMOUNT_MINIMUM', 400);
    }

    // Atomic balance deduction
    const user = await this.userModel.findOneAndUpdate(
      { _id: new Types.ObjectId(userId), balance: { $gte: amount } },
      { $inc: { balance: -amount, total_witdrawal: amount } },
      { returnDocument: 'after' },
    );

    if (!user) {
      const msg = 'Error: insufficient funds for transaction';
      await this.saveTxMessage(userId, amount, coin, wallet, msg);
      throw new BusinessException('ERROR_WITHDRAWAL_INSUFFICIENT_BALANCE', 400);
    }

    try {
      const binanceResult = await sendWithdrawalRequest(coin, network, wallet, amount);
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
      this.historyCache.delete(`withdrawal-history:${userId}`);

      return { balance: new Decimal(user.balance).toNumber() };
    } catch (err) {
      // Rollback balance on Binance error
      await this.userModel.findByIdAndUpdate(userId, {
        $inc: { balance: amount, total_witdrawal: -amount },
      });
      const msg = typeof err === 'string' ? err : (err as any).message || 'Error: transaction processing';
      await this.saveTxMessage(userId, amount, coin, wallet, msg);
      this.logger.error(`Binance withdrawal failed: ${err}`);
      throw new BusinessException('ERROR_GENERIC_RESPONSE', 500);
    }
  }

  async initiateWithdrawal(
    userId: string,
    amount: number,
    verificationExpiryMins: number,
    lang = 'en',
  ): Promise<void> {
    this.historyCache.delete(`withdrawal-history:${userId}`);
    const user = await this.userModel.findById(userId);
    if (!user) throw new BusinessException('ERROR_USER_NOTFOUND', 404);

    if (!user.wallet_address || !user.wallet_address.coin || !user.wallet_address.wallet) {
      throw new BusinessException('ERROR_USER_WALLET_NOTFOUND', 400);
    }

    const { coin, wallet: walletAddress, network } = user.wallet_address;

    // 1. Validate Wallet Config
    const walletConfig = await this.walletService.findByCoinAndNetwork(coin, network);
    if (!walletConfig) throw new BusinessException('ERROR_WALLET_NOT_CONFIGURED', 400);
    if (amount < walletConfig.minAmount) {
      const msg = 'Error: transaction amount below minimum required';
      await this.saveTxMessage(userId, amount, coin, walletAddress, msg);
      throw new BusinessException('ERROR_WITHDRAWAL_AMOUNT_MINIMUM', 400);
    }

    // 2. Validate Daily Limit
    const config = await this.appConfigService.getConfig();
    const limit = config.withdrawal_daily_limit;
    if (limit > 0) {
      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);

      const todayWithdrawals = await this.withdrawalModel.aggregate([
        {
          $match: {
            user_id: new Types.ObjectId(userId),
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
        throw new BusinessException('ERROR_WITHDRAWAL_DAILY_LIMIT_EXCEEDED', 400);
      }
    }

    // 3. Check for existing pending
    const foundWithdrawal = await this.withdrawalModel.findOne({
      user_id: new Types.ObjectId(userId),
      status: 'pending_verify',
    });
    if (foundWithdrawal) {
      const msg = 'Error: transaction pending verification';
      await this.saveTxMessage(userId, amount, coin, walletAddress, msg);
      throw new BusinessException('ERROR_WITHDRAWAL_PENDING_VERIFY', 400);
    }

    // 3. Check balance
    if (user.balance < amount) {
      const msg = 'Error: insufficient funds for transaction';
      await this.saveTxMessage(userId, amount, coin, walletAddress, msg);
      throw new BusinessException('ERROR_WITHDRAWAL_INSUFFICIENT_BALANCE', 400);
    }

    // 4. Create Withdrawal with hashed code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedCode = await bcrypt.hash(verificationCode, 10);
    const verification_expires_at = new Date(Date.now() + verificationExpiryMins * 60 * 1000);

    await this.withdrawalModel.create({
      user_id: new Types.ObjectId(userId),
      amount,
      coin: coin.toUpperCase(),
      wallet: walletAddress,
      network,
      tx_fee: walletConfig.networkWithdrawalFee || 0,
      verification_code: hashedCode,
      verification_expires_at,
    });

    // Send verificationCode via email
    await this.emailService.sendWithdrawalVerification(
      user.email,
      user.username,
      verificationCode,
      verificationExpiryMins,
      lang,
    );

    this.logger.log(`Withdrawal initiated for user ${userId}`);
  }

  private async saveTxMessage(user_id: string, amount: number, coin: string, wallet: string, message: string) {
    try {
      await this.txMessageModel.create({
        user_id: new Types.ObjectId(user_id),
        amount,
        coin,
        message,
        wallet,
        txType: 'withdrawal',
      });
    } catch (err) {
      this.logger.error(`Error saving TxMessage: ${err}`);
    }
  }

  async getHistory(userId: string): Promise<any[]> {
    return this.historyCache.getOrSet(`withdrawal-history:${userId}`, 10_000, async () => {
      const list = await this.withdrawalModel
        .find({ user_id: new Types.ObjectId(userId) })
        .select('amount coin status wallet network tx_fee txId created_at confirmed_at')
        .sort({ created_at: -1 })
        .lean();

      return list.map((w: any) => ({
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
    });
  }
}
