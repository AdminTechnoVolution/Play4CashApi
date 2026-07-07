import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Recharge, RechargeDocument } from './schemas/recharge.schema';
import { BusinessException } from '../../common/exceptions/business.exception';
import { getDepositHistory } from '../../common/clients/binance.client';
import Decimal from 'decimal.js';

@Injectable()
export class RechargeService {
  private readonly logger = new Logger(RechargeService.name);
  private readonly pendingWalletMessage = 'The transaction has not appeared in our wallet yet. Please try again later.';

  constructor(
    @InjectModel(Recharge.name) private readonly rechargeModel: Model<RechargeDocument>,
    @InjectModel('User') private readonly userModel: Model<any>,
    @InjectModel('TxMessage') private readonly txMessageModel: Model<any>,
  ) {}

  async createRecharge(
    userId: string,
    txId: string,
    coin: string,
    amount: number,
    processingExpiryMins: number,
  ): Promise<{ balance: number }> {
    const time_processing_expires_at = new Date(Date.now() + processingExpiryMins * 60 * 1000);

    let recharge: any;
    try {
      // Let Mongo enforce the unique txId index atomically.
      recharge = await this.rechargeModel.create({
        user_id: new Types.ObjectId(userId),
        txId,
        coin: coin.toUpperCase(),
        amount,
        time_processing_expires_at,
      });
    } catch (err) {
      if (this.isDuplicateTxIdError(err)) {
        const existing = await this.rechargeModel.findOne({ txId }).lean();
        throw new BusinessException(
          existing?.status === 'confirmed' ? 'WARNING_TX_CONFIRMED' : 'WARNING_TX_IN_PROCESS',
          400,
        );
      }
      throw err;
    }

    // Validate against Binance
    let deposit: any;
    try {
      const deposits = await getDepositHistory({ coin: recharge.coin });
      deposit = deposits.find((d: any) => d.txId === txId);
      if (!deposit) throw new Error('TX not found in Binance');
      if (!new Decimal(deposit.amount).equals(new Decimal(amount))) throw new Error('Amount mismatch');
      if (deposit.coin?.toUpperCase() !== coin.toUpperCase()) throw new Error('Coin mismatch');
      if (![1, 6].includes(deposit.status)) throw new Error(`Unexpected status: ${deposit.status}`);
    } catch (err) {
      this.logger.error(`Binance validation failed: ${err}`);
      await this.rechargeModel.deleteOne({ _id: recharge._id });
      await this.saveTxMessage(userId, txId, amount, coin, this.pendingWalletMessage);
      throw new BusinessException('WARNING_TX_NOT_FOUND', 400);
    }

    // Atomically credit balance
    const user = await this.userModel.findByIdAndUpdate(
      userId,
      {
        $inc: {
          balance: amount,
          total_recharged: amount,
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

    await this.saveTxMessage(userId, txId, amount, coin, 'Confirmed');

    return { balance: new Decimal(user.balance).toNumber() };
  }

  async getHistory(userId: string): Promise<RechargeDocument[]> {
    return this.rechargeModel
      .find({ user_id: new Types.ObjectId(userId) })
      .select('amount coin status wallet network txId created_at confirmed_at')
      .sort({ created_at: -1 })
      .lean() as any;
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

  private isDuplicateTxIdError(err: any): boolean {
    if (!err) return false;
    if (err.code !== 11000) return false;

    const keyPattern = err.keyPattern || {};
    const keyValue = err.keyValue || {};
    if (keyPattern.txId || keyValue.txId !== undefined) return true;

    return typeof err.message === 'string' && err.message.includes('txId');
  }
}
