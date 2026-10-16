import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomUUID } from 'crypto';
import Decimal from 'decimal.js';
import { positiveMoney, bsonMoney } from '../../payments/money';
import { LedgerService } from '../../payments/ledger.service';
import { consumeFinancialMfa } from '../../payments/financial-mfa';
import { idempotencyKey } from '../../payments/payments.service';
import { fingerprint } from '../../payments/canonical';
import { ConfigService } from '@nestjs/config';
import { Tournament, TournamentDocument } from '../schemas/tournament.schema';
import {
  TOURNAMENT_SUPPORTED_SOCKET_CODES,
  TournamentStatus,
} from '../constants/tournament.constants';
import { CreateTournamentDto, UpdateTournamentDto } from '../dtos/tournament.dto';
import { Game, GameDocument } from '../../game/schemas/game.schema';
import {
  normalizeLanguageField,
  normalizeOptionalLanguageField,
} from '../tournament-language.util';
import { resolveTournamentLayout } from '../tournament-layout.util';

@Injectable()
export class TournamentAdminService {
  constructor(
    @InjectModel(Tournament.name) private readonly tournamentModel: Model<TournamentDocument>,
    @InjectModel(Game.name) private readonly gameModel: Model<GameDocument>,
    private readonly config: ConfigService,
  ) {}

  private validatePercents(house: number, first: number, second: number): void {
    if (house + first + second !== 100) {
      throw new BadRequestException('Prize percents must sum to 100');
    }
  }

  private async resolveGame(gameId: string): Promise<GameDocument> {
    const game = await this.gameModel.findById(gameId);
    if (!game) throw new NotFoundException('Game not found');
    if (!TOURNAMENT_SUPPORTED_SOCKET_CODES.includes(game.socket_code as any)) {
      throw new BadRequestException(`Game ${game.socket_code} is not supported for tournaments`);
    }
    return game;
  }

  async findAll(): Promise<TournamentDocument[]> {
    return this.tournamentModel.find().sort({ starts_at: -1 }).exec();
  }

  async findById(id: string): Promise<TournamentDocument> {
    const t = await this.tournamentModel.findById(id);
    if (!t) throw new NotFoundException('Tournament not found');
    return t;
  }

  async create(dto: CreateTournamentDto): Promise<TournamentDocument> {
    const buyIn = positiveMoney(String(dto.buyIn));
    if (new Decimal(buyIn).lt('0.01')) throw new BadRequestException('BUY_IN_BELOW_MINIMUM');
    const layout = resolveTournamentLayout(
      dto.maxPlayers,
      dto.minPlayers,
      dto.groupSize,
      dto.groupCount,
    );

    const house = dto.houseFeePercent ?? 10;
    const first = dto.firstPlacePercent ?? 70;
    const second = dto.secondPlacePercent ?? 20;
    this.validatePercents(house, first, second);

    const game = await this.resolveGame(dto.gameId);
    const startsAt = new Date(dto.startsAt);

    return this.tournamentModel.create({
      title: normalizeLanguageField(dto.title, 'TITLE'),
      description: normalizeOptionalLanguageField(dto.description),
      game_id: game._id,
      game_socket_code: game.socket_code,
      status: TournamentStatus.DRAFT,
      buy_in: Number(buyIn),
      buy_in_decimal: bsonMoney(buyIn),
      max_players: layout.maxPlayers,
      min_players: layout.minPlayers,
      group_count: layout.groupCount,
      group_size: layout.groupSize,
      starts_at: startsAt,
      registration_opens_at: dto.registrationOpensAt ? new Date(dto.registrationOpensAt) : undefined,
      registration_closes_at: dto.registrationClosesAt
        ? new Date(dto.registrationClosesAt)
        : startsAt,
      turn_timer_seconds: dto.turnTimerSeconds ?? 30,
      between_rounds_pause_seconds: dto.betweenRoundsPauseSeconds ?? 300,
      presence_window_seconds: dto.presenceWindowSeconds ?? 90,
      rematch_delay_seconds: dto.rematchDelaySeconds ?? 60,
      house_fee_percent: house,
      first_place_percent: first,
      second_place_percent: second,
      bracket_seed: dto.bracketSeed?.trim() || randomUUID(),
    });
  }

  async update(id: string, dto: UpdateTournamentDto): Promise<TournamentDocument> {
    const t = await this.findById(id);
    if (t.status !== TournamentStatus.DRAFT) {
      throw new BadRequestException('Only draft tournaments can be edited');
    }

    const nextMax = dto.maxPlayers ?? t.max_players;
    const nextMin = dto.minPlayers ?? t.min_players;
    if (
      dto.maxPlayers != null ||
      dto.minPlayers != null ||
      dto.groupCount != null ||
      dto.groupSize != null
    ) {
      const layout = resolveTournamentLayout(
        nextMax,
        nextMin,
        dto.groupSize ?? t.group_size,
        dto.groupCount ?? t.group_count,
      );
      t.max_players = layout.maxPlayers;
      t.min_players = layout.minPlayers;
      t.group_count = layout.groupCount;
      t.group_size = layout.groupSize;
    }

    if (dto.houseFeePercent != null || dto.firstPlacePercent != null || dto.secondPlacePercent != null) {
      this.validatePercents(
        dto.houseFeePercent ?? t.house_fee_percent,
        dto.firstPlacePercent ?? t.first_place_percent,
        dto.secondPlacePercent ?? t.second_place_percent,
      );
    }

    if (dto.gameId) {
      const game = await this.resolveGame(dto.gameId);
      t.game_id = game._id as Types.ObjectId;
      t.game_socket_code = game.socket_code;
    }
    if (dto.title != null) t.title = normalizeLanguageField(dto.title, 'TITLE');
    if (dto.description != null) t.description = normalizeOptionalLanguageField(dto.description);
    if (dto.buyIn != null) {
      const buyIn = positiveMoney(String(dto.buyIn));
      if (new Decimal(buyIn).lt('0.01')) throw new BadRequestException('BUY_IN_BELOW_MINIMUM');
      t.buy_in = Number(buyIn);
      t.buy_in_decimal = bsonMoney(buyIn);
    }
    if (dto.startsAt != null) t.starts_at = new Date(dto.startsAt);
    if (dto.registrationOpensAt != null) t.registration_opens_at = new Date(dto.registrationOpensAt);
    if (dto.registrationClosesAt != null) t.registration_closes_at = new Date(dto.registrationClosesAt);
    if (dto.turnTimerSeconds != null) t.turn_timer_seconds = dto.turnTimerSeconds;
    if (dto.betweenRoundsPauseSeconds != null) {
      t.between_rounds_pause_seconds = dto.betweenRoundsPauseSeconds;
    }
    if (dto.presenceWindowSeconds != null) t.presence_window_seconds = dto.presenceWindowSeconds;
    if (dto.rematchDelaySeconds != null) t.rematch_delay_seconds = dto.rematchDelaySeconds;
    if (dto.houseFeePercent != null) t.house_fee_percent = dto.houseFeePercent;
    if (dto.firstPlacePercent != null) t.first_place_percent = dto.firstPlacePercent;
    if (dto.secondPlacePercent != null) t.second_place_percent = dto.secondPlacePercent;
    if (dto.bracketSeed != null) t.bracket_seed = dto.bracketSeed.trim();

    await t.save();
    return t;
  }

  async open(id: string): Promise<TournamentDocument> {
    const t = await this.findById(id);
    if (t.status !== TournamentStatus.DRAFT) {
      throw new BadRequestException('Only draft tournaments can be opened');
    }
    if (t.starts_at.getTime() <= Date.now()) {
      throw new BadRequestException('startsAt must be in the future');
    }
    this.validatePercents(t.house_fee_percent, t.first_place_percent, t.second_place_percent);
    resolveTournamentLayout(t.max_players, t.min_players, t.group_size, t.group_count);
    t.status = TournamentStatus.OPEN;
    if (!t.registration_opens_at) t.registration_opens_at = new Date();
    if (!t.registration_closes_at) t.registration_closes_at = t.starts_at;
    await t.save();
    return t;
  }

  async cancel(id: string, authorization?: { adminId: string; code: string; key: string; reason: string }): Promise<TournamentDocument> {
    if (process.env.FINANCE_V2_ENABLED === 'true') {
      if (!authorization || authorization.reason.length < 10) throw new BadRequestException('FINANCIAL_AUTHORIZATION_REQUIRED');
      const db = this.tournamentModel.db;
      const requestId = `admin:tournament:cancel:${authorization.adminId}:${idempotencyKey(authorization.key)}`;
      const hash = fingerprint({ id, reason: authorization.reason });
      await new LedgerService(db).transaction(async session => {
        const previous = await db.collection('finance_admin_audit').findOne({ _id: requestId as any }, { session });
        if (previous) {
          if (previous.hash !== hash) throw new BadRequestException('IDEMPOTENCY_CONFLICT');
          return;
        }
        await consumeFinancialMfa(db, this.config, authorization.adminId, authorization.code, session);
        const cancelled = await this.tournamentModel.findOneAndUpdate({ _id: id,
          status: { $nin: [TournamentStatus.FINISHED, TournamentStatus.CANCELLED] }, prizes_settled: { $ne: true } },
          { $set: { status: TournamentStatus.CANCELLED } }, { session, returnDocument: 'after' });
        if (!cancelled) throw new BadRequestException('Tournament already terminal');
        const rooms = await db.collection('rooms').find({ tournament_id: new Types.ObjectId(id), status: { $in: ['waiting', 'started'] } }, { session }).toArray();
        const namespace = cancelled.game_socket_code === 'battleship' ? '/naval-battle' : `/${cancelled.game_socket_code}`;
        for (const room of rooms) {
          const version = Number(room.command_revision ?? 0) + 1;
          await db.collection('rooms').updateOne({ _id: room._id }, { $set: { status: 'finished', winner_reason: 'tournament_cancelled', finished_at: new Date(), command_revision: version } }, { session });
          await db.collection('game_outbox').insertOne({ roomId: String(room._id), sequence: version, index: 0, published: false, createdAt: new Date(),
            event: { namespace, rooms: [String(room._id)], except: [], event: namespace.slice(1), args: [{ success: true, messages: [], data: { roomId: String(room._id), stateVersion: version, gameEnded: true, gameStarted: false, reason: 'tournament_cancelled' } }] } }, { session });
        }
        await db.collection('finance_admin_audit').insertOne({ _id: requestId as any, adminId: authorization.adminId, tournamentId: id,
          hash, reason: authorization.reason, decision: 'cancel_tournament', createdAt: new Date() }, { session });
      });
      return this.findById(id);
    }
    const t = await this.findById(id);
    if (t.status === TournamentStatus.FINISHED || t.status === TournamentStatus.CANCELLED) {
      throw new BadRequestException('Tournament already terminal');
    }
    t.status = TournamentStatus.CANCELLED;
    await t.save();
    return t;
  }
}
