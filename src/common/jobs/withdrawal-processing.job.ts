import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { Inject } from '@nestjs/common';
import { REDIS_CLIENT } from '../redis/redis.module';
import { getWithdrawalHistory } from '../clients/binance.client';
import { I18nService } from '../i18n/i18n.service';
import Decimal from 'decimal.js';

const JOB_LOCK_KEY = 'job:withdrawal-processing';
const JOB_LOCK_TTL_SECS = 55;

// Binance Statuses
const SUCCESS_BINANCE_WITHDRAWAL = 6;
const REJECTED_BINANCE_WITHDRAWAL = 3;

@Injectable()
export class WithdrawalProcessingJob {
  private readonly logger = new Logger(WithdrawalProcessingJob.name);

  constructor(
    @InjectModel('Withdrawal') private readonly withdrawalModel: Model<any>,
    @InjectModel('User') private readonly userModel: Model<any>,
    @InjectModel('TxMessage') private readonly txMessageModel: Model<any>,
    private readonly config: ConfigService,
    private readonly i18n: I18nService,
    @Inject(REDIS_CLIENT) private readonly redis: any,
  ) { }

  @Cron(process.env.JOB_CRON_WITHDRAWAL_IN_PROCESSING || '*/10 * * * *')
  async handleCron(): Promise<void> {
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
    } catch (err) {
      this.logger.error(
        `Withdrawal Processing Job: Critical error: ${err.message}`,
      );
    } finally {
      this.logger.log('Withdrawal Processing Job: Instance finished.');
      await this.redis.del(JOB_LOCK_KEY);
    }
  }

  private async processWithdrawals(): Promise<void> {
    const withdrawals = await this.withdrawalModel
      .find({ status: 'processing' })
      .lean();

    if (!withdrawals.length) {
      this.logger.debug('No withdrawals in "processing" status found.');
      return;
    }

    this.logger.log(
      `Checking ${withdrawals.length} withdrawals in status "processing"`,
    );

    // Batch Binance history call for all pending IDs (matching legacy behavior)
    const idList = withdrawals.map((w: any) => w.id_binance).join(',');
    this.logger.log(`Fetching Binance history for IDs: ${idList}`);

    let binanceHistory: any[] = [];
    try {
      binanceHistory = await getWithdrawalHistory({ idList });
    } catch (err) {
      this.logger.error(`Failed to fetch Binance history: ${err.message}`);
      return;
    }

    for (const withdrawal of withdrawals) {
      try {
        const binanceRecord = binanceHistory?.find(
          (h: any) => h.id === withdrawal.id_binance,
        );

        if (!binanceRecord) {
          this.logger.warn(
            `Binance record not found for withdrawal ${withdrawal._id} (Binance ID: ${withdrawal.id_binance})`,
          );
          continue;
        }

        this.logger.log(
          `Processing withdrawal ${withdrawal._id}. Binance status: ${binanceRecord.status}`,
        );

        if (binanceRecord.status === SUCCESS_BINANCE_WITHDRAWAL) {
          await this.confirmWithdrawal(withdrawal, binanceRecord);
        } else if (binanceRecord.status === REJECTED_BINANCE_WITHDRAWAL) {
          await this.rejectWithdrawal(withdrawal, binanceRecord);
        } else {
          await this.logOtherStatus(withdrawal, binanceRecord);
        }
      } catch (err) {
        this.logger.error(
          `Error processing withdrawal ${withdrawal._id}: ${err.message}`,
        );
      }
    }
  }

  private async confirmWithdrawal(
    withdrawal: any,
    binanceWithdrawal: any,
  ): Promise<void> {
    const user = await this.userModel.findById(withdrawal.user_id);
    if (!user) {
      this.logger.error(
        `User ${withdrawal.user_id} not found for withdrawal ${withdrawal._id}`,
      );
      return;
    }

    const newTotalWithdrawn = new Decimal(user.total_witdrawal || 0)
      .plus(withdrawal.amount)
      .toNumber();

    await this.userModel.findByIdAndUpdate(withdrawal.user_id, {
      total_witdrawal: newTotalWithdrawn,
    });

    const updateData = {
      status: 'confirmed',
      txId: binanceWithdrawal.txId,
      tx_fee: new Decimal(withdrawal.amount)
        .minus(binanceWithdrawal.amount)
        .toNumber(),
      amount: binanceWithdrawal.amount,
      confirmed_at: new Date(),
      confirmed_at_binance: binanceWithdrawal.completeTime
        ? new Date(binanceWithdrawal.completeTime)
        : new Date(),
      transfer_type:
        binanceWithdrawal.transferType === 1 ? 'internal' : 'external',
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

    this.logger.log(
      `Withdrawal ${withdrawal._id} confirmed successfully. TxId: ${binanceWithdrawal.txId}`,
    );
  }

  private async rejectWithdrawal(
    withdrawal: any,
    binanceWithdrawal: any,
  ): Promise<void> {
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

    this.logger.warn(
      `Withdrawal ${withdrawal._id} rejected by Binance and refunded. Records updated.`,
    );
  }

  private async logOtherStatus(
    withdrawal: any,
    binanceWithdrawal: any,
  ): Promise<void> {
    const message =
      this.i18n.translate('message_tx.otherstatus') + binanceWithdrawal.status;

    await this.txMessageModel.create({
      user_id: withdrawal.user_id,
      txId: binanceWithdrawal.txId || 'N/A',
      amount: withdrawal.amount,
      coin: withdrawal.coin,
      wallet: withdrawal.wallet,
      txType: 'withdrawal',
      message: message,
    });

    this.logger.debug(
      `Withdrawal ${withdrawal._id} still in status ${binanceWithdrawal.status} on Binance. Transaction message recorded.`,
    );
  }
}
