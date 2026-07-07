import { Model, Types } from 'mongoose';
import { TournamentMatchDocument } from '../schemas/tournament-match.schema';
import { TournamentDocument } from '../schemas/tournament.schema';
import { TournamentParticipantDocument } from '../schemas/tournament-participant.schema';
import { TournamentGroupDocument } from '../schemas/tournament-group.schema';
import { RoomDocument } from '../../room/schemas/room.schema';
import { TournamentBracketService } from './tournament-bracket.service';
import { TournamentSettlementService } from './tournament-settlement.service';
import { TournamentsGateway } from '../../websockets/tournaments/tournaments.gateway';
export declare class TournamentMatchService {
    private readonly matchModel;
    private readonly tournamentModel;
    private readonly participantModel;
    private readonly groupModel;
    private readonly roomModel;
    private readonly bracketService;
    private readonly settlement;
    private readonly tournamentsGateway;
    private readonly logger;
    constructor(matchModel: Model<TournamentMatchDocument>, tournamentModel: Model<TournamentDocument>, participantModel: Model<TournamentParticipantDocument>, groupModel: Model<TournamentGroupDocument>, roomModel: Model<RoomDocument>, bracketService: TournamentBracketService, settlement: TournamentSettlementService, tournamentsGateway: TournamentsGateway);
    createTournamentRoom(tournament: TournamentDocument, match: TournamentMatchDocument): Promise<Types.ObjectId>;
    ensureRoomForMatch(tournament: TournamentDocument, match: TournamentMatchDocument): Promise<Types.ObjectId | null>;
    advanceWinner(match: TournamentMatchDocument, winnerId: Types.ObjectId, reason: string): Promise<void>;
    private checkRoundComplete;
    private handleGroupFinalsComplete;
    tryCompleteFromFinishedRoom(room: RoomDocument, winnerId: string, reason: string): Promise<void>;
    completeFromGameRoom(room: RoomDocument, result: {
        winnerId: string;
        loserId?: string;
        reason: string;
    }): Promise<void>;
    forfeitMatch(matchId: string, winnerId: string, reason: string): Promise<void>;
    activateRoundMatches(tournament: TournamentDocument, roundIndex: number): Promise<void>;
}
