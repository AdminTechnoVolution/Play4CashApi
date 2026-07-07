import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Recharge, RechargeDocument } from './schemas/recharge.schema';
import { BusinessException } from '../../common/exceptions/business.exception';
import { getDepositHistory } from '../../common/clients/binance.client';
import Decimal from 'decimal.js';
import { TtlCache } from '../../common/ttl-cache';

@Injectable()
export class RechargeService {
  private readonly logger = new Logger(RechargeService.name);
  private readonly historyCache = new TtlCache<RechargeDocument[]>();

  constructor(
    @InjectModel(Recharge.name) private readonly rechargeModel: Model<RechargeDocument>,
    @InjectModel('User') private readonly userModel: Model<any>,
    @InjectModel('TxMessage') private readonly txMessageModel: Model<any>,
  ) {}

  async createRecharge(
    userId: string,
    txId: string,
    coin: string,
    processingExpiryMins: number,
  ): Promise<{ balance: number }> {
    this.historyCache.delete(`recharge-history:${userId}`);
    const time_processing_expires_at = new Date(Date.now() + processingExpiryMins * 60 * 1000);

    const existing = await this.findExistingRechargeByTxId(txId);
    if (existing) {
      this.throwDuplicateRecharge(existing);
    }

    // Validate against Binance
    let deposit: any;
    try {
      const deposits = await getDepositHistory({ coin: coin.toUpperCase() });
      deposit = deposits.find((d: any) => d.txId === txId);
      if (!deposit) throw new Error('TX not found in Binance');
      if (deposit.coin?.toUpperCase() !== coin.toUpperCase()) throw new Error('Coin mismatch');
      if (![1, 6].includes(deposit.status)) throw new Error(`Unexpected status: ${deposit.status}`);
    } catch (err) {
      this.logger.error(`Binance validation failed: ${err}`);
      await this.saveTxMessage(userId, txId, deposit?.amount ?? 0, coin, this.toWalletFacingRechargeMessage(err));
      throw new BusinessException('WARNING_TX_NOT_FOUND', 400);
    }

    const depositAmount = new Decimal(deposit.amount).toNumber();

    let recharge: RechargeDocument;
    try {
      recharge = await this.rechargeModel.create({
        user_id: new Types.ObjectId(userId),
        txId,
        coin: coin.toUpperCase(),
        amount: depositAmount,
        time_processing_expires_at,
      });
    } catch (err) {
      if (this.isDuplicateTxError(err)) {
        const duplicate = await this.findExistingRechargeByTxId(txId);
        this.throwDuplicateRecharge(duplicate);
      }
      throw err;
    }

    // Atomically credit balance
    const user = await this.userModel.findByIdAndUpdate(
      userId,
      {
        $inc: {
          balance: depositAmount,
          total_recharged: depositAmount,
        },
      },
      { returnDocument: 'after' },
    );

    await this.rechargeModel.findByIdAndUpdate(recharge._id, {
      $set: {
        wallet: deposit.address,
        network: deposit.network,
        status: 'confirmed',
        confirmed_at: new Date(),
      },
      $unset: {
        time_processing_expires_at: '',
      },
    });

    await this.saveTxMessage(userId, txId, depositAmount, coin, 'Confirmed');
    this.historyCache.delete(`recharge-history:${userId}`);

    return { balance: new Decimal(user.balance).toNumber() };
  }

  async getHistory(userId: string): Promise<RechargeDocument[]> {
    return this.historyCache.getOrSet(`recharge-history:${userId}`, 10_000, async () =>
      this.rechargeModel
        .find({ user_id: new Types.ObjectId(userId) })
        .select('amount coin status wallet network txId created_at confirmed_at')
        .sort({ created_at: -1 })
        .lean() as any,
    );
  }

  private async saveTxMessage(
    userId: string,
    txId: string,
    amount: number,
    coin: string,
    message: string,
  ): Promise<void> {
    try {
      await this.txMessageModel.create({ user_id: userId, txId, amount, coin, message, txType: 'recharge' });
    } catch (err) {
      this.logger.error(`Error saving tx message: ${err}`);
    }
  }

  private async findExistingRechargeByTxId(txId: string): Promise<any | null> {
    const query = this.rechargeModel.findOne({ txId }) as any;
    if (!query) return null;
    if (typeof query.lean === 'function') {
      return query.lean();
    }
    return query;
  }

  private throwDuplicateRecharge(existing: any): never {
    throw new BusinessException(
      existing?.status === 'confirmed' ? 'WARNING_TX_CONFIRMED' : 'WARNING_TX_IN_PROCESS',
      400,
    );
  }

  private isDuplicateTxError(err: unknown): boolean {
    const e = err as { code?: number; keyPattern?: Record<string, unknown>; message?: string };
    return e?.code === 11000 && (e.keyPattern?.txId === 1 || String(e.message || '').includes('txId'));
  }

  private toWalletFacingRechargeMessage(err: unknown): string {
    const raw = err instanceof Error ? err.message : String(err || '');
    if (raw.includes('TX not found in Binance')) {
      return 'The transaction has not appeared in our wallet yet. Please try again later.';
    }
    return raw;
  }
}
