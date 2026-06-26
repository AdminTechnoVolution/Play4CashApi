import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Game, GameDocument } from './schemas/game.schema';
import { Room, RoomDocument, RoomStatus } from '../room/schemas/room.schema';
import { BusinessException } from '../../common/exceptions/business.exception';
import { TtlCache } from '../../common/ttl-cache';
import { logSlowEvent } from '../../common/perf-log.util';
import { CONNECT_FOUR_SOCKET_CODE } from '../../common/constants/connect-four-game.constants';
import {
  UNO_MATCH_TARGET_DEFAULT,
  UNO_SOCKET_CODE,
} from '../../common/constants/uno-game.constants';
import { GAME_CATALOG_RULES } from './game-catalog-rules';
import {
  normalizeLanguageField,
  normalizeRulesField,
  toAdminGameRecord,
} from './game-language.util';
import type { CreateGameDto, UpdateGameDto } from './dtos/game-admin.dto';

@Injectable()
export class GameService implements OnModuleInit {
  private readonly logger = new Logger(GameService.name);
  private readonly publicGamesCache = new TtlCache<any[]>();
  private readonly publicGameByIdCache = new TtlCache<any>();
  private readonly activeRoomCountsCache = new TtlCache<Map<string, number>>();

  constructor(
    @InjectModel(Game.name) private readonly gameModel: Model<GameDocument>,
    @InjectModel(Room.name) private readonly roomModel: Model<RoomDocument>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureUnoCatalogEntry();
    await this.ensureConnectFourCatalogEntry();
    await this.ensureCatalogRules();
  }

  /** Idempotent: creates Connect Four catalog row if missing. */
  private async ensureConnectFourCatalogEntry(): Promise<void> {
    const exists = await this.gameModel.findOne({ socket_code: CONNECT_FOUR_SOCKET_CODE }).lean();
    if (exists) return;

    const localized = (en: string, es: string, fr?: string, de?: string, it?: string, pt?: string) => ({
      en,
      es,
      fr: fr ?? en,
      de: de ?? en,
      it: it ?? en,
      pt: pt ?? en,
    });

    await this.gameModel.create({
      name: localized('Connect Four', '4 en raya', 'Puissance 4', 'Vier gewinnt', 'Forza 4', 'Lig 4'),
      description: localized(
        'Drop discs to connect four in a row — horizontal, vertical, or diagonal.',
        'Conecta cuatro fichas en línea — horizontal, vertical o diagonal.',
        'Alignez quatre pions pour gagner.',
        'Verbinde vier Spielsteine in einer Reihe.',
        'Allinea quattro pedine in fila.',
        'Alinhe quatro fichas em linha.',
      ),
      active: true,
      min_players: 2,
      max_players: 2,
      min_bet: 5,
      default_bets: [5, 10, 25, 50, 100],
      house_edge: 5,
      socket_code: CONNECT_FOUR_SOCKET_CODE,
      turn_timer_seconds: 30,
      rules: GAME_CATALOG_RULES[CONNECT_FOUR_SOCKET_CODE] ?? [],
    });
    this.logger.log(`Catalog: inserted game "${CONNECT_FOUR_SOCKET_CODE}" (2 players, 6×7).`);
  }

  /** Idempotent: creates the UNO catalog row if missing (Fase 1). */
  private async ensureUnoCatalogEntry(): Promise<void> {
    const exists = await this.gameModel.findOne({ socket_code: UNO_SOCKET_CODE }).lean();
    if (exists) {
      await this.gameModel.updateMany(
        { socket_code: UNO_SOCKET_CODE, uno_match_target: { $exists: false } },
        { $set: { uno_match_target: UNO_MATCH_TARGET_DEFAULT } },
      );
      return;
    }

    const localized = (en: string, es: string) => ({
      en,
      es,
      fr: en,
      de: en,
      it: en,
      pt: en,
    });

    await this.gameModel.create({
      name: localized('UNO', 'UNO'),
      description: localized(
        'Classic card game for 2–10 players. Match color or number, use action cards, and empty your hand to win the round.',
        'Juego de cartas clásico para 2–10 jugadores. Iguala color o número, usa cartas de acción y quédate sin cartas para ganar la ronda.',
      ),
      active: true,
      min_players: 2,
      max_players: 10,
      min_bet: 5,
      default_bets: [5, 10, 25, 50, 100],
      house_edge: 5,
      socket_code: UNO_SOCKET_CODE,
      turn_timer_seconds: 45,
      uno_match_target: UNO_MATCH_TARGET_DEFAULT,
      rules: GAME_CATALOG_RULES[UNO_SOCKET_CODE] ?? [],
    });
    this.logger.log(`Catalog: inserted game "${UNO_SOCKET_CODE}" (min_players=2, max_players=10).`);
  }

  /** Keep catalog rules aligned with `game-catalog-rules.ts` (overwrites prior defaults). */
  private async ensureCatalogRules(): Promise<void> {
    for (const [socketCode, rules] of Object.entries(GAME_CATALOG_RULES)) {
      if (!rules.length) continue;
      const result = await this.gameModel.updateMany(
        { socket_code: socketCode },
        { $set: { rules } },
      );
      if (result.matchedCount > 0) {
        this.logger.log(
          `Catalog: synced ${result.modifiedCount}/${result.matchedCount} rule set(s) for "${socketCode}".`,
        );
      }
    }
  }

  async findAll(lang = 'en'): Promise<any[]> {
    const cacheKey = `games:${lang}`;
    return this.publicGamesCache.getOrSet(cacheKey, 30_000, async () => {
      const startedAt = process.hrtime.bigint();
      const [data, activeRoomCounts] = await Promise.all([
        this.gameModel.find({ active: true }).select('-created_at').lean(),
        this.aggregateActiveRoomCounts(),
      ]);

      const countMap = activeRoomCounts;

      const games = this.localizeGames(data, lang);
      const payload = games.map((g: any) => ({
        ...g,
        houseEdge: g.house_edge,
        unoMatchTarget: g.uno_match_target,
        activeRooms: countMap.get(g._id.toString()) ?? 0,
      }));
      logSlowEvent(this.logger, 'games_catalog_trace', startedAt, 25, { game_count: payload.length });
      return payload;
    });
  }

  /** Admin catalog: every game, full i18n name/description/rules (no Accept-Language flattening). */
  async findAllAdmin(): Promise<any[]> {
    const [data, countMap] = await Promise.all([
      this.gameModel.find().select('-created_at').sort({ socket_code: 1 }).lean(),
      this.aggregateActiveRoomCounts(),
    ]);
    return data.map((g) =>
      toAdminGameRecord(g as Record<string, any>, countMap.get(String(g._id)) ?? 0),
    );
  }

  async findById(id: string, lang = 'en'): Promise<any> {
    const cacheKey = `game:${id}:${lang}`;
    return this.publicGameByIdCache.getOrSet(cacheKey, 30_000, async () => {
      const startedAt = process.hrtime.bigint();
      const game = await this.gameModel.findById(id).select('-created_at').lean();
      if (!game) throw new BusinessException('ERROR_GAME_NOT_FOUND', 404);
      const g = this.localizeGames([game], lang)[0];
      const payload = { ...g, houseEdge: g.house_edge, unoMatchTarget: g.uno_match_target };
      logSlowEvent(this.logger, 'game_detail_trace', startedAt, 25, { gameId: id });
      return payload;
    });
  }

  async findByIdAdmin(id: string): Promise<Record<string, unknown>> {
    const game = await this.gameModel.findById(id).select('-created_at').lean();
    if (!game) throw new BusinessException('ERROR_GAME_NOT_FOUND', 404);
    const counts = await this.aggregateActiveRoomCounts();
    return toAdminGameRecord(game as Record<string, any>, counts.get(String(game._id)) ?? 0);
  }

  async create(dto: CreateGameDto): Promise<Record<string, unknown>> {
    const payload = this.toCreatePayload(dto);
    const created = await this.gameModel.create(payload);
    return toAdminGameRecord(created.toObject() as Record<string, any>, 0);
  }

  async update(id: string, dto: UpdateGameDto): Promise<Record<string, unknown>> {
    const patch = this.toUpdatePayload(dto);
    if (Object.keys(patch).length === 0) {
      return this.findByIdAdmin(id);
    }
    const game = await this.gameModel
      .findByIdAndUpdate(id, { $set: patch }, { returnDocument: 'after' })
      .select('-created_at')
      .lean();
    if (!game) throw new BusinessException('ERROR_GAME_NOT_FOUND', 404);
    const counts = await this.aggregateActiveRoomCounts();
    return toAdminGameRecord(game as Record<string, any>, counts.get(String(game._id)) ?? 0);
  }

  async remove(id: string): Promise<void> {
    const game = await this.gameModel.findByIdAndDelete(id);
    if (!game) throw new BusinessException('ERROR_GAME_NOT_FOUND', 404);
  }

  private async aggregateActiveRoomCounts(): Promise<Map<string, number>> {
    return this.activeRoomCountsCache.getOrSet('active-room-counts', 5_000, async () => {
      const activeRoomCounts = await this.roomModel.aggregate([
        { $match: { status: { $ne: RoomStatus.FINISHED } } },
        { $group: { _id: '$game_id', count: { $sum: 1 } } },
      ]);
      return new Map<string, number>(
        activeRoomCounts.map((r) => [r._id.toString(), r.count]),
      );
    });
  }

  private toCreatePayload(dto: CreateGameDto): Record<string, unknown> {
    return {
      name: normalizeLanguageField(dto.name, 'NAME'),
      description: normalizeLanguageField(dto.description, 'DESCRIPTION'),
      rules: normalizeRulesField(dto.rules ?? []),
      active: dto.active,
      min_players: dto.min_players,
      max_players: dto.max_players,
      min_bet: dto.min_bet,
      default_bets: dto.default_bets,
      house_edge: dto.house_edge,
      socket_code: dto.socket_code,
      turn_timer_seconds: dto.turn_timer_seconds,
      ...(dto.uno_match_target !== undefined ? { uno_match_target: dto.uno_match_target } : {}),
    };
  }

  private toUpdatePayload(dto: UpdateGameDto): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    if (dto.name !== undefined) out.name = normalizeLanguageField(dto.name, 'NAME');
    if (dto.description !== undefined) {
      out.description = normalizeLanguageField(dto.description, 'DESCRIPTION');
    }
    if (dto.rules !== undefined) out.rules = normalizeRulesField(dto.rules);
    if (dto.active !== undefined) out.active = dto.active;
    if (dto.min_players !== undefined) out.min_players = dto.min_players;
    if (dto.max_players !== undefined) out.max_players = dto.max_players;
    if (dto.min_bet !== undefined) out.min_bet = dto.min_bet;
    if (dto.default_bets !== undefined) out.default_bets = dto.default_bets;
    if (dto.house_edge !== undefined) out.house_edge = dto.house_edge;
    if (dto.socket_code !== undefined) out.socket_code = dto.socket_code;
    if (dto.turn_timer_seconds !== undefined) out.turn_timer_seconds = dto.turn_timer_seconds;
    if (dto.uno_match_target !== undefined) out.uno_match_target = dto.uno_match_target;
    return out;
  }

  /** Pick name/description/rules by language — matches original getGameValuesByLanguage logic */
  private localizeGames(games: any[], lang: string): any[] {
    const supportedLangs = ['es', 'en', 'fr', 'de', 'it', 'pt'];
    const l = supportedLangs.includes(lang) ? lang : 'en';
    return games.map((game) => {
      const g = { ...game };
      if (g.name && typeof g.name === 'object') {
        g.name = g.name[l] ?? g.name.en ?? g.name.es ?? '';
      }
      if (g.description && typeof g.description === 'object') {
        g.description = g.description[l] ?? g.description.en ?? g.description.es ?? '';
      }
      if (Array.isArray(g.rules)) {
        g.rules = g.rules
          .map((rule: any) => {
            if (rule && typeof rule === 'object') {
              return rule[l] ?? rule.en ?? rule.es ?? '';
            }
            return typeof rule === 'string' ? rule : '';
          })
          .filter((text: string) => text.trim().length > 0);
      } else {
        g.rules = [];
      }
      return g;
    });
  }
}
