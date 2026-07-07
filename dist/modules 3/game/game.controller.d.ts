import { GameService } from './game.service';
export declare class GameController {
    private readonly gameService;
    constructor(gameService: GameService);
    findAll(lang: string): Promise<any[]>;
    findById(id: string, lang: string): Promise<any>;
}
