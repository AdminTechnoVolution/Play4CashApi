import { GameService } from './game.service';
export declare class GameController {
    private readonly gameService;
    constructor(gameService: GameService);
    findAll(lang: string): Promise<any[]>;
    findById(id: string, lang: string): Promise<any>;
    create(body: any): Promise<import("./schemas/game.schema").GameDocument>;
    update(id: string, body: any): Promise<any>;
    remove(id: string): Promise<{
        success: boolean;
        messages: string[];
        data: null;
    }>;
}
