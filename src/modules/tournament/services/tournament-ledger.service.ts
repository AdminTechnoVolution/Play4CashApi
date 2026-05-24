import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  TournamentTransaction,
  TournamentTransactionDocument,
} from '../schemas/tournament-transaction.schema';
import { TournamentTransactionType } from '../constants/tournament.constants';
import { User, UserDocument } from '../../user/schemas/user.schema';

@Injectable()
export class TournamentLedgerService {
  private readonly logger = new Logger(TournamentLedgerService.name);

  constructor(
    @InjectModel(TournamentTransaction.name)
    private readonly txModel: Model<TournamentTransactionDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async debitRegistration(
    tournamentId: Types.ObjectId,
    userId: Types.ObjectId,
    amount: number,
    idempotencyKey: string,
  ): Promise<void> {
    const existing = await this.txModel.findOne({ idempotency_key: idempotencyKey });
    if (existing) return;

    const updated = await this.userModel.findOneAndUpdate(
      { _id: userId, balance: { $gte: amount } },
      { $inc: { balance: -amount } },
      { returnDocument: 'after' },
    );
    if (!updated) {
      throw new Error('INSUFFICIENT_BALANCE');
    }

    await this.txModel.create({
      tournament_id: tournamentId,
      user_id: userId,
      type: TournamentTransactionType.REGISTRATION_DEBIT,
      amount: -amount,
      status: 'completed',
      idempotency_key: idempotencyKey,
      reference: 'registration',
    });
  }

  async refundRegistration(
    tournamentId: Types.ObjectId,
    userId: Types.ObjectId,
    amount: number,
    idempotencyKey: string,
  ): Promise<void> {
    const existing = await this.txModel.findOne({ idempotency_key: idempotencyKey });
    if (existing) return;

    await this.userModel.updateOne({ _id: userId }, { $inc: { balance: amount } });
    await this.txModel.create({
      tournament_id: tournamentId,
      user_id: userId,
      type: TournamentTransactionType.REGISTRATION_REFUND,
      amount,
      status: 'completed',
      idempotency_key: idempotencyKey,
      reference: 'refund',
    });
  }

  async creditPrize(
    tournamentId: Types.ObjectId,
    userId: Types.ObjectId,
    amount: number,
    type: TournamentTransactionType.FIRST_PLACE_PRIZE | TournamentTransactionType.SECOND_PLACE_PRIZE,
    idempotencyKey: string,
  ): Promise<void> {
    const existing = await this.txModel.findOne({ idempotency_key: idempotencyKey });
    if (existing) return;

    await this.userModel.updateOne({ _id: userId }, { $inc: { balance: amount } });
    await this.txModel.create({
      tournament_id: tournamentId,
      user_id: userId,
      type,
      amount,
      status: 'completed',
      idempotency_key: idempotencyKey,
      reference: type,
    });
  }

  async recordHouseFee(
    tournamentId: Types.ObjectId,
    amount: number,
    idempotencyKey: string,
  ): Promise<void> {
    const existing = await this.txModel.findOne({ idempotency_key: idempotencyKey });
    if (existing) return;

    await this.txModel.create({
      tournament_id: tournamentId,
      type: TournamentTransactionType.HOUSE_FEE,
      amount,
      status: 'completed',
      idempotency_key: idempotencyKey,
      reference: 'house_fee',
    });
  }

  async refundAllRegistered(
    tournamentId: Types.ObjectId,
    participants: Array<{ user_id: Types.ObjectId; amount: number }>,
  ): Promise<void> {
    for (const p of participants) {
      const key = `idem:tournament:refund:${tournamentId}:${p.user_id}`;
      try {
        await this.refundRegistration(tournamentId, p.user_id, p.amount, key);
      } catch (e) {
        this.logger.warn(`event=tournament_refund_skip user=${p.user_id} err=${(e as Error).message}`);
      }
    }
  }
}
