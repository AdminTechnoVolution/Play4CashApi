import { OnModuleInit } from '@nestjs/common';
import { Model } from 'mongoose';
import { Game, GameDocument } from './schemas/game.schema';
import { RoomDocument } from '../room/schemas/room.schema';
export declare class GameService implements OnModuleInit {
    private readonly gameModel;
    private readonly roomModel;
    private readonly logger;
    constructor(gameModel: Model<GameDocument>, roomModel: Model<RoomDocument>);
    onModuleInit(): Promise<void>;
    private ensureUnoCatalogEntry;
    findAll(lang?: string): Promise<any[]>;
    findById(id: string, lang?: string): Promise<any>;
    create(data: Partial<Game>): Promise<GameDocument>;
    update(id: string, data: Partial<Game>): Promise<any>;
    remove(id: string): Promise<void>;
    private localizeGames;
}
