import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Game, GameDocument } from './schemas/game.schema';
import { Room, RoomDocument, RoomStatus } from '../room/schemas/room.schema';
import { BusinessException } from '../../common/exceptions/business.exception';
import { CONNECT_FOUR_SOCKET_CODE } from '../../common/constants/connect-four-game.constants';
import {
  UNO_MATCH_TARGET_DEFAULT,
  UNO_SOCKET_CODE,
} from '../../common/constants/uno-game.constants';
import { GAME_CATALOG_RULES } from './game-catalog-rules';

@Injectable()
export class GameService implements OnModuleInit {
  private readonly logger = new Logger(GameService.name);

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
        'Classic card game for 2–10 players (even counts). Match color or number, use action cards, and empty your hand to win the round.',
        'Juego de cartas clásico para 2–10 jugadores (cantidades pares). Iguala color o número, usa cartas de acción y quédate sin cartas para ganar la ronda.',
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
    const [data, activeRoomCounts] = await Promise.all([
      this.gameModel.find({ active: true }).select('-created_at').lean(),
      this.roomModel.aggregate([
        { $match: { status: { $ne: RoomStatus.FINISHED } } },
        { $group: { _id: '$game_id', count: { $sum: 1 } } },
      ]),
    ]);

    const countMap = new Map<string, number>(
      activeRoomCounts.map((r) => [r._id.toString(), r.count]),
    );

    const games = this.localizeGames(data, lang);
    return games.map((g: any) => ({
      ...g,
      houseEdge: g.house_edge,
      unoMatchTarget: g.uno_match_target,
      activeRooms: countMap.get(g._id.toString()) ?? 0,
    }));
  }

  async findById(id: string, lang = 'en'): Promise<any> {
    const game = await this.gameModel.findById(id).select('-created_at').lean();
    if (!game) throw new BusinessException('ERROR_GAME_NOT_FOUND', 404);
    const g = this.localizeGames([game], lang)[0];
    return { ...g, houseEdge: g.house_edge, unoMatchTarget: g.uno_match_target };
  }

  async create(data: Partial<Game>): Promise<GameDocument> {
    return this.gameModel.create(data);
  }

  async update(id: string, data: Partial<Game>): Promise<any> {
    const game = await this.gameModel.findByIdAndUpdate(id, data, { returnDocument: 'after' }).lean();
    if (!game) throw new BusinessException('ERROR_GAME_NOT_FOUND', 404);
    return game;
  }

  async remove(id: string): Promise<void> {
    const game = await this.gameModel.findByIdAndDelete(id);
    if (!game) throw new BusinessException('ERROR_GAME_NOT_FOUND', 404);
  }

  /** Pick name/description/rules by language — matches original getGameValuesByLanguage logic */
  private localizeGames(games: any[], lang: string): any[] {
    const l = lang === 'es' ? 'es' : 'en';
    return games.map((game) => {
      const g = { ...game };
      if (g.name && typeof g.name === 'object') g.name = g.name[l] ?? g.name.en;
      if (g.description && typeof g.description === 'object') {
        g.description = g.description[l] ?? g.description.en;
      }
      if (Array.isArray(g.rules)) {
        g.rules = g.rules
          .map((rule: any) => {
            if (rule && typeof rule === 'object') return rule[l] ?? rule.en ?? '';
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
