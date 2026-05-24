import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomUUID } from 'crypto';
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

@Injectable()
export class TournamentAdminService {
  constructor(
    @InjectModel(Tournament.name) private readonly tournamentModel: Model<TournamentDocument>,
    @InjectModel(Game.name) private readonly gameModel: Model<GameDocument>,
  ) {}

  private validateGroupLayout(max: number, groupCount: number, groupSize: number): void {
    if (groupCount * groupSize !== max) {
      throw new BadRequestException('groupCount × groupSize must equal maxPlayers');
    }
  }

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
    const groupCount = dto.groupCount ?? 5;
    const groupSize = dto.groupSize ?? 10;
    this.validateGroupLayout(dto.maxPlayers, groupCount, groupSize);

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
      buy_in: dto.buyIn,
      max_players: dto.maxPlayers,
      min_players: dto.minPlayers,
      group_count: groupCount,
      group_size: groupSize,
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
    const nextGroupCount = dto.groupCount ?? t.group_count;
    const nextGroupSize = dto.groupSize ?? t.group_size;
    if (
      dto.maxPlayers != null ||
      dto.groupCount != null ||
      dto.groupSize != null
    ) {
      this.validateGroupLayout(nextMax, nextGroupCount, nextGroupSize);
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
    if (dto.buyIn != null) t.buy_in = dto.buyIn;
    if (dto.maxPlayers != null) t.max_players = dto.maxPlayers;
    if (dto.minPlayers != null) t.min_players = dto.minPlayers;
    if (dto.groupCount != null) t.group_count = dto.groupCount;
    if (dto.groupSize != null) t.group_size = dto.groupSize;
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
    this.validateGroupLayout(t.max_players, t.group_count, t.group_size);
    t.status = TournamentStatus.OPEN;
    if (!t.registration_opens_at) t.registration_opens_at = new Date();
    if (!t.registration_closes_at) t.registration_closes_at = t.starts_at;
    await t.save();
    return t;
  }

  async cancel(id: string): Promise<TournamentDocument> {
    const t = await this.findById(id);
    if (t.status === TournamentStatus.FINISHED || t.status === TournamentStatus.CANCELLED) {
      throw new BadRequestException('Tournament already terminal');
    }
    t.status = TournamentStatus.CANCELLED;
    await t.save();
    return t;
  }
}
