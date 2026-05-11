import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Game, GameDocument } from './schemas/game.schema';
import { Room, RoomDocument, RoomStatus } from '../room/schemas/room.schema';
import { BusinessException } from '../../common/exceptions/business.exception';
import { UNO_SOCKET_CODE } from '../../common/constants/uno-game.constants';

@Injectable()
export class GameService implements OnModuleInit {
  private readonly logger = new Logger(GameService.name);

  constructor(
    @InjectModel(Game.name) private readonly gameModel: Model<GameDocument>,
    @InjectModel(Room.name) private readonly roomModel: Model<RoomDocument>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureUnoCatalogEntry();
  }

  /** Idempotent: creates the UNO catalog row if missing (Fase 1). */
  private async ensureUnoCatalogEntry(): Promise<void> {
    const exists = await this.gameModel.findOne({ socket_code: UNO_SOCKET_CODE }).lean();
    if (exists) return;

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
    });
    this.logger.log(`Catalog: inserted game "${UNO_SOCKET_CODE}" (min_players=2, max_players=10).`);
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
      activeRooms: countMap.get(g._id.toString()) ?? 0,
    }));
  }

  async findById(id: string, lang = 'en'): Promise<any> {
    const game = await this.gameModel.findById(id).select('-created_at').lean();
    if (!game) throw new BusinessException('ERROR_GAME_NOT_FOUND', 404);
    return this.localizeGames([game], lang)[0];
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

  /** Pick name/description by language — matches original getGameValuesByLanguage logic */
  private localizeGames(games: any[], lang: string): any[] {
    return games.map(game => {
      const g = { ...game };
      const l = lang === 'es' ? 'es' : 'en';
      if (g.name && typeof g.name === 'object') g.name = g.name[l] ?? g.name.en;
      if (g.description && typeof g.description === 'object') g.description = g.description[l] ?? g.description.en;
      return g;
    });
  }
}
