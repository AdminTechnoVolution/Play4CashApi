import { Model } from 'mongoose';
import { TournamentDocument } from '../schemas/tournament.schema';
import { CreateTournamentDto, UpdateTournamentDto } from '../dtos/tournament.dto';
import { GameDocument } from '../../game/schemas/game.schema';
export declare class TournamentAdminService {
    private readonly tournamentModel;
    private readonly gameModel;
    constructor(tournamentModel: Model<TournamentDocument>, gameModel: Model<GameDocument>);
    private validatePercents;
    private resolveGame;
    findAll(): Promise<TournamentDocument[]>;
    findById(id: string): Promise<TournamentDocument>;
    create(dto: CreateTournamentDto): Promise<TournamentDocument>;
    update(id: string, dto: UpdateTournamentDto): Promise<TournamentDocument>;
    open(id: string): Promise<TournamentDocument>;
    cancel(id: string): Promise<TournamentDocument>;
}
