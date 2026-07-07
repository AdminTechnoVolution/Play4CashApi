import { Model } from 'mongoose';
import { TournamentDocument } from '../schemas/tournament.schema';
import { TournamentParticipantDocument } from '../schemas/tournament-participant.schema';
import { TournamentMatchDocument } from '../schemas/tournament-match.schema';
import { TournamentBracketService } from './tournament-bracket.service';
import { TournamentMatchService } from './tournament-match.service';
import { TournamentLedgerService } from './tournament-ledger.service';
import { TournamentsGateway } from '../../websockets/tournaments/tournaments.gateway';
import { RoomDocument } from '../../room/schemas/room.schema';
export declare class TournamentSchedulerService {
    private readonly tournamentModel;
    private readonly participantModel;
    private readonly matchModel;
    private readonly roomModel;
    private readonly bracketService;
    private readonly matchService;
    private readonly ledger;
    private readonly redis;
    private readonly tournamentsGateway;
    private readonly logger;
    constructor(tournamentModel: Model<TournamentDocument>, participantModel: Model<TournamentParticipantDocument>, matchModel: Model<TournamentMatchDocument>, roomModel: Model<RoomDocument>, bracketService: TournamentBracketService, matchService: TournamentMatchService, ledger: TournamentLedgerService, redis: any, tournamentsGateway: TournamentsGateway);
    tick(): Promise<void>;
    private withLock;
    private processStartTimes;
    private processBetweenRounds;
    private repairStuckMatchesFromFinishedRooms;
    private repairBrokenMatchRooms;
    private activatePendingFinalsMatches;
}
