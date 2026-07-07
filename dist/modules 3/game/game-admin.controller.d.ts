import { GameService } from './game.service';
import { CreateGameDto, UpdateGameDto } from './dtos/game-admin.dto';
export declare class GameAdminController {
    private readonly gameService;
    constructor(gameService: GameService);
    findAll(): Promise<{
        success: boolean;
        messages: never[];
        data: any[];
    }>;
    findById(id: string): Promise<{
        success: boolean;
        messages: never[];
        data: Record<string, unknown>;
    }>;
    create(body: CreateGameDto): Promise<{
        success: boolean;
        messages: never[];
        data: Record<string, unknown>;
    }>;
    update(id: string, body: UpdateGameDto): Promise<{
        success: boolean;
        messages: never[];
        data: Record<string, unknown>;
    }>;
    remove(id: string): Promise<{
        success: boolean;
        messages: string[];
        data: null;
    }>;
}
