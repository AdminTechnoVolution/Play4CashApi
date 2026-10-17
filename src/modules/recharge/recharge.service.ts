import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Recharge, RechargeDocument } from './schemas/recharge.schema';
import { RechargeIntent, RechargeIntentDocument } from './schemas/recharge-intent.schema';
import { BusinessException } from '../../common/exceptions/business.exception';
import { getDepositHistory } from '../../common/clients/binance.client';
import Decimal from 'decimal.js';
import { TtlCache } from '../../common/ttl-cache';
import { WalletService } from '../wallet/wallet.service';

export interface RechargeIntentResult {
  intentId: string;
  coin: string;
  network: string;
  address: string;
  exactAmount: number;
  expiresAt: Date;
}

@Injectable()
export class RechargeService {
  private readonly logger = new Logger(RechargeService.name);
  private readonly historyCache = new TtlCache<RechargeDocument[]>();

  constructor(
    @InjectModel(Recharge.name) private readonly rechargeModel: Model<RechargeDocument>,
    @InjectModel('User') private readonly userModel: Model<any>,
    @InjectModel('TxMessage') private readonly txMessageModel: Model<any>,
    @InjectModel(RechargeIntent.name) private readonly rechargeIntentModel: Model<RechargeIntentDocument>,
    private readonly walletService: WalletService,
  ) {}

  /**
   * Reserves an exact deposit amount for the user on a given coin/network
   * before they send funds. `createRecharge` will only credit a txId whose
   * on-chain amount matches an unclaimed, unexpired intent owned by the
   * claiming user — this is what prevents any authenticated user from
   * claiming someone else's deposit to the shared platform wallet by
   * racing a publicly-visible txId.
   */
  async createIntent(
    userId: string,
    coin: string,
    network: string,
    requestedAmount: number,
    expiryMins: number,
  ): Promise<RechargeIntentResult> {
    const coinUpper = coin.toUpperCase();
    const wallet = await this.walletService.findByCoinAndNetwork(coinUpper, network);
    if (!wallet) throw new BusinessException('ERROR_RECHARGE_WALLET_NOT_CONFIGURED', 400);

    const amount = new Decimal(requestedAmount);
    if (!amount.isFinite() || amount.lte(0)) {
      throw new BusinessException('amount.positive', 400);
    }
    if (wallet.minAmount && amount.lt(wallet.minAmount)) {
      throw new BusinessException('ERROR_RECHARGE_AMOUNT_MINIMUM', 400);
    }

    const expiresAt = new Date(Date.now() + expiryMins * 60 * 1000);
    const baseAmount = amount.toDecimalPlaces(4).toNumber();

    const MAX_ATTEMPTS = 10;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const exactAmount = amount.plus(this.randomFingerprint()).toDecimalPlaces(4).toNumber();
      try {
        const intent = await this.rechargeIntentModel.create({
          user_id: new Types.ObjectId(userId),
          coin: coinUpper,
          network,
          requestedAmount: baseAmount,
          exactAmount,
          address: wallet.address,
          expires_at: expiresAt,
        });
        return {
          intentId: String(intent._id),
          coin: coinUpper,
          network,
          address: wallet.address,
          exactAmount,
          expiresAt,
        };
      } catch (err) {
        if (this.isDuplicateExactAmountError(err) && attempt < MAX_ATTEMPTS - 1) continue;
        throw err;
      }
    }
    throw new BusinessException('ERROR_GENERIC_RESPONSE', 500);
  }

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
    const matchAmount = new Decimal(deposit.amount).toDecimalPlaces(4).toNumber();

    // Claim the reservation atomically: only a pending, unexpired intent
    // owned by this user and matching the exact deposited amount qualifies.
    // Without this, crediting would trust a client-supplied txId against the
    // exchange account's whole deposit history with no ownership check.
    const intent = await this.rechargeIntentModel.findOneAndUpdate(
      {
        user_id: new Types.ObjectId(userId),
        coin: coin.toUpperCase(),
        exactAmount: matchAmount,
        status: 'pending',
        expires_at: { $gt: new Date() },
      },
      {
        $set: { status: 'claimed', claimed_at: new Date(), txId },
        $unset: { expires_at: '' },
      },
      { returnDocument: 'after' },
    );

    if (!intent) {
      await this.saveTxMessage(
        userId,
        txId,
        depositAmount,
        coin,
        'No matching deposit reservation for this amount. Create a reservation before sending funds.',
      );
      throw new BusinessException('WARNING_NO_MATCHING_DEPOSIT_INTENT', 400);
    }

    let recharge: RechargeDocument;
    try {
      recharge = await this.rechargeModel.create({
        user_id: new Types.ObjectId(userId),
        intent_id: intent._id,
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

  private isDuplicateExactAmountError(err: unknown): boolean {
    const e = err as { code?: number; keyPattern?: Record<string, unknown> };
    return e?.code === 11000 && !!e.keyPattern?.exactAmount;
  }

  /**
   * A small, low-order offset (0.0001–0.0999) layered on top of the
   * user-requested amount so concurrently-reserved amounts don't collide,
   * without being large enough to matter to the depositor.
   */
  private randomFingerprint(): number {
    return Math.floor(1 + Math.random() * 999) / 10000;
  }

  private toWalletFacingRechargeMessage(err: unknown): string {
    const raw = err instanceof Error ? err.message : String(err || '');
    if (raw.includes('TX not found in Binance')) {
      return 'The transaction has not appeared in our wallet yet. Please try again later.';
    }
    return raw;
  }
}
