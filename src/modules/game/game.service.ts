import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Game, GameDocument } from './schemas/game.schema';
import { Room, RoomDocument, RoomStatus } from '../room/schemas/room.schema';
import { BusinessException } from '../../common/exceptions/business.exception';

@Injectable()
export class GameService {
  constructor(
    @InjectModel(Game.name) private readonly gameModel: Model<GameDocument>,
    @InjectModel(Room.name) private readonly roomModel: Model<RoomDocument>,
  ) {}

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
