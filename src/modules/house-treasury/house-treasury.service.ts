import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import Decimal from 'decimal.js';
import { Connection, Model, Types } from 'mongoose';
import { getSpotAssetBalance } from '../../common/clients/binance.client';
import { calculateWinnerSettlement } from '../../common/utils/game-prize.util';
import { Room, RoomDocument, RoomStatus } from '../room/schemas/room.schema';
import { User, UserDocument } from '../user/schemas/user.schema';
import {
  HouseLedger,
  HouseLedgerDocument,
  HouseLedgerType,
} from './schemas/house-ledger.schema';
import {
  HouseWithdrawal,
  HouseWithdrawalDocument,
} from './schemas/house-withdrawal.schema';
import {
  HouseTreasuryConfig,
  HouseTreasuryConfigDocument,
} from './schemas/house-treasury-config.schema';
import {
  CreateHouseAdjustmentDto,
  CreateHouseWithdrawalDto,
  HouseLedgerQueryDto,
} from './dtos/house-treasury.dto';

const money = (value: Decimal.Value) => new Decimal(value).toDecimalPlaces(2).toNumber();

@Injectable()
export class HouseTreasuryService implements OnModuleInit {
  private readonly logger = new Logger(HouseTreasuryService.name);
  private activatedAt?: Date;

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(HouseLedger.name) private readonly ledgerModel: Model<HouseLedgerDocument>,
    @InjectModel(HouseWithdrawal.name)
    private readonly withdrawalModel: Model<HouseWithdrawalDocument>,
    @InjectModel(HouseTreasuryConfig.name)
    private readonly configModel: Model<HouseTreasuryConfigDocument>,
    @InjectModel(Room.name) private readonly roomModel: Model<RoomDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async onModuleInit(): Promise<void> {
    const config = await this.configModel.findOneAndUpdate(
      { key: 'main' },
      { $setOnInsert: { key: 'main', activated_at: new Date(), ledger_balance: 0 } },
      { upsert: true, returnDocument: 'after' },
    );
    this.activatedAt = config.activated_at;
    void this.reconcileCasualGameFees();
  }

  async recordTournamentFee(tournamentId: Types.ObjectId, amount: number): Promise<void> {
    const rounded = money(amount);
    if (rounded <= 0) return;
    await this.createLedgerEntry({
      type: HouseLedgerType.TOURNAMENT_FEE,
      amount: rounded,
      idempotency_key: `house:tournament:${tournamentId}`,
      tournament_id: tournamentId,
      occurred_at: new Date(),
      description: 'Comisión de torneo',
    });
  }

  @Cron('*/30 * * * * *')
  async reconcileCasualGameFees(): Promise<void> {
    if (!this.activatedAt) return;
    const rooms = await this.roomModel
      .find({
        source: { $ne: 'tournament' },
        status: RoomStatus.FINISHED,
        finished_at: { $gte: this.activatedAt },
        winner: { $exists: true, $ne: null },
        bet_amount: { $gt: 0 },
        house_edge: { $gt: 0 },
      })
      .populate('game_id', 'socket_code')
      .limit(500)
      .lean();

    for (const room of rooms) {
      try {
        const roomId = room._id as Types.ObjectId;
        const settlement = calculateWinnerSettlement(
          room.bet_amount,
          room.house_edge,
          room.players.length,
        );
        if (settlement.houseFee <= 0) continue;
        const game = room.game_id as unknown as { socket_code?: string };
        await this.createLedgerEntry({
          type: HouseLedgerType.CASUAL_GAME_FEE,
          amount: settlement.houseFee,
          idempotency_key: `house:room:${roomId}`,
          room_id: roomId,
          game_code: game?.socket_code,
          bet_amount: room.bet_amount,
          house_edge: room.house_edge,
          occurred_at: room.finished_at || new Date(),
          description: 'Comisión de partida casual',
          metadata: { player_count: room.players.length, winner_reason: room.winner_reason },
        });
      } catch (error) {
        this.logger.warn(`No se pudo conciliar comisión de sala: ${(error as Error).message}`);
      }
    }
  }

  @Cron('15,45 * * * * *')
  async reconcileTournamentFees(): Promise<void> {
    if (!this.activatedAt) return;
    const transactions = await this.connection
      .collection('tournamenttransactions')
      .find({
        type: 'house_fee',
        status: 'completed',
        createdAt: { $gte: this.activatedAt },
        amount: { $gt: 0 },
      })
      .limit(500)
      .toArray();
    for (const transaction of transactions) {
      try {
        await this.recordTournamentFee(
          new Types.ObjectId(String(transaction.tournament_id)),
          Number(transaction.amount),
        );
      } catch (error) {
        this.logger.warn(`No se pudo conciliar comisión de torneo: ${(error as Error).message}`);
      }
    }
  }

  async getSummary(refreshBinance = false): Promise<Record<string, unknown>> {
    await this.reconcileCasualGameFees();
    const [totals, users] = await Promise.all([
      this.ledgerModel.aggregate([
        {
          $group: {
            _id: null,
            house_balance: { $sum: '$amount' },
            commissions: {
              $sum: {
                $cond: [
                  { $in: ['$type', [HouseLedgerType.CASUAL_GAME_FEE, HouseLedgerType.TOURNAMENT_FEE]] },
                  '$amount',
                  0,
                ],
              },
            },
            withdrawals: {
              $sum: {
                $cond: [{ $eq: ['$type', HouseLedgerType.HOUSE_WITHDRAWAL] }, { $abs: '$amount' }, 0],
              },
            },
          },
        },
      ]),
      this.userModel.aggregate([{ $group: { _id: null, liability: { $sum: '$balance' } } }]),
    ]);

    const houseBalance = money(totals[0]?.house_balance || 0);
    const userLiability = money(users[0]?.liability || 0);
    const expectedFunds = money(houseBalance + userLiability);
    let binance: Record<string, unknown> = { available: false, refreshed: refreshBinance };
    try {
      const balance = await getSpotAssetBalance('USDT');
      const free = money(balance.free);
      binance = {
        available: true,
        asset: 'USDT',
        free,
        locked: money(balance.locked),
        frozen: money(balance.frozen),
        withdrawing: money(balance.withdrawing),
        total: money(balance.total),
        queried_at: new Date(),
        refreshed: refreshBinance,
      };
      return {
        currency: 'USDT',
        activated_at: this.activatedAt,
        user_liability: userLiability,
        commissions: money(totals[0]?.commissions || 0),
        withdrawals: money(totals[0]?.withdrawals || 0),
        house_balance: houseBalance,
        expected_funds: expectedFunds,
        reconciliation_difference: money(free - expectedFunds),
        users_fully_covered: free >= userLiability,
        binance,
      };
    } catch (error) {
      binance = { available: false, error: 'BINANCE_BALANCE_UNAVAILABLE', queried_at: new Date() };
    }
    return {
      currency: 'USDT',
      activated_at: this.activatedAt,
      user_liability: userLiability,
      commissions: money(totals[0]?.commissions || 0),
      withdrawals: money(totals[0]?.withdrawals || 0),
      house_balance: houseBalance,
      expected_funds: expectedFunds,
      reconciliation_difference: null,
      users_fully_covered: null,
      binance,
    };
  }

  async list(query: HouseLedgerQueryDto): Promise<Record<string, unknown>> {
    const filter: Record<string, unknown> = {};
    for (const key of ['type', 'game_code', 'room_id', 'tournament_id', 'administrator_id']) {
      const value = query[key as keyof HouseLedgerQueryDto];
      if (value) filter[key] = value;
    }
    if (query.from || query.to) {
      filter.occurred_at = {
        ...(query.from ? { $gte: query.from } : {}),
        ...(query.to ? { $lte: query.to } : {}),
      };
    }
    const page = query.page || 1;
    const limit = query.limit || 25;
    const [items, total] = await Promise.all([
      this.ledgerModel
        .find(filter)
        .populate('administrator_id', 'username email')
        .sort({ occurred_at: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.ledgerModel.countDocuments(filter),
    ]);
    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async getById(id: string): Promise<HouseLedgerDocument> {
    const item = await this.ledgerModel
      .findById(id)
      .populate('administrator_id', 'username email');
    if (!item) throw new NotFoundException('Movimiento contable no encontrado');
    return item;
  }

  async createWithdrawal(
    dto: CreateHouseWithdrawalDto,
    administratorId: string,
  ): Promise<HouseWithdrawalDocument> {
    const existing = await this.withdrawalModel.findOne({ idempotency_key: dto.idempotency_key });
    if (existing) return existing;
    const session = await this.connection.startSession();
    let created!: HouseWithdrawalDocument;
    try {
      await session.withTransaction(async () => {
        const amount = money(dto.amount);
        const reserved = await this.configModel.findOneAndUpdate(
          { key: 'main', ledger_balance: { $gte: amount } },
          { $inc: { ledger_balance: -amount } },
          { session, returnDocument: 'after' },
        );
        if (!reserved) {
          throw new BadRequestException('El retiro excede el saldo disponible de la casa');
        }
        [created] = await this.withdrawalModel.create(
          [{ ...dto, amount, administrator_id: new Types.ObjectId(administratorId) }],
          { session },
        );
        await this.ledgerModel.create(
          [{
            type: HouseLedgerType.HOUSE_WITHDRAWAL,
            amount: -amount,
            currency: 'USDT',
            idempotency_key: `ledger:${dto.idempotency_key}`,
            withdrawal_id: created._id,
            administrator_id: new Types.ObjectId(administratorId),
            occurred_at: dto.occurred_at,
            description: dto.purpose,
            metadata: {
              category: dto.category,
              destination: dto.destination,
              external_reference: dto.external_reference,
              notes: dto.notes,
            },
          }],
          { session },
        );
      });
      return created;
    } finally {
      await session.endSession();
    }
  }

  async createAdjustment(
    dto: CreateHouseAdjustmentDto,
    administratorId: string,
  ): Promise<HouseLedgerDocument> {
    const existing = await this.ledgerModel.findOne({ idempotency_key: dto.idempotency_key });
    if (existing) return existing;
    const original = await this.ledgerModel.findById(dto.correction_of);
    if (!original) throw new NotFoundException('Movimiento original no encontrado');
    const signedAmount = money(dto.direction === 'credit' ? dto.amount : -dto.amount);
    return this.createLedgerEntry({
      type: dto.direction === 'credit'
        ? HouseLedgerType.ADJUSTMENT_CREDIT
        : HouseLedgerType.ADJUSTMENT_DEBIT,
      amount: signedAmount,
      idempotency_key: dto.idempotency_key,
      correction_of: original._id as Types.ObjectId,
      administrator_id: new Types.ObjectId(administratorId),
      occurred_at: dto.occurred_at,
      description: dto.reason,
    });
  }

  private async createLedgerEntry(
    entry: Partial<HouseLedger> & Pick<HouseLedger, 'type' | 'amount' | 'idempotency_key' | 'occurred_at'>,
  ): Promise<HouseLedgerDocument> {
    const existing = await this.ledgerModel.findOne({ idempotency_key: entry.idempotency_key });
    if (existing) return existing;
    const session = await this.connection.startSession();
    try {
      let created!: HouseLedgerDocument;
      await session.withTransaction(async () => {
        const prior = await this.ledgerModel
          .findOne({ idempotency_key: entry.idempotency_key })
          .session(session);
        if (prior) {
          created = prior;
          return;
        }
        if (entry.amount < 0) {
          const debited = await this.configModel.findOneAndUpdate(
            { key: 'main', ledger_balance: { $gte: Math.abs(entry.amount) } },
            { $inc: { ledger_balance: entry.amount } },
            { session, returnDocument: 'after' },
          );
          if (!debited) throw new BadRequestException('El ajuste excede el saldo disponible de la casa');
        } else {
          await this.configModel.updateOne(
            { key: 'main' },
            { $inc: { ledger_balance: entry.amount } },
            { session },
          );
        }
        [created] = await this.ledgerModel.create(
          [{ ...entry, currency: 'USDT' }],
          { session },
        );
      });
      return created;
    } catch (error: any) {
      if (error?.code === 11000) {
        const duplicate = await this.ledgerModel.findOne({ idempotency_key: entry.idempotency_key });
        if (duplicate) return duplicate;
      }
      throw error;
    } finally {
      await session.endSession();
    }
  }
}
