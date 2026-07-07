import { OnModuleInit } from '@nestjs/common';
import { Model } from 'mongoose';
import { GameDocument } from './schemas/game.schema';
import { RoomDocument } from '../room/schemas/room.schema';
import type { CreateGameDto, UpdateGameDto } from './dtos/game-admin.dto';
export declare class GameService implements OnModuleInit {
    private readonly gameModel;
    private readonly roomModel;
    private readonly logger;
    constructor(gameModel: Model<GameDocument>, roomModel: Model<RoomDocument>);
    onModuleInit(): Promise<void>;
    private ensureConnectFourCatalogEntry;
    private ensureUnoCatalogEntry;
    private ensureCatalogRules;
    findAll(lang?: string): Promise<any[]>;
    findAllAdmin(): Promise<any[]>;
    findById(id: string, lang?: string): Promise<any>;
    findByIdAdmin(id: string): Promise<Record<string, unknown>>;
    create(dto: CreateGameDto): Promise<Record<string, unknown>>;
    update(id: string, dto: UpdateGameDto): Promise<Record<string, unknown>>;
    remove(id: string): Promise<void>;
    private aggregateActiveRoomCounts;
    private toCreatePayload;
    private toUpdatePayload;
    private localizeGames;
}
