import { Model } from 'mongoose';
import { TournamentDocument } from '../schemas/tournament.schema';
import { TournamentParticipantDocument } from '../schemas/tournament-participant.schema';
import { TournamentGroupDocument } from '../schemas/tournament-group.schema';
import { TournamentMatchDocument } from '../schemas/tournament-match.schema';
export declare class TournamentBracketService {
    private readonly tournamentModel;
    private readonly participantModel;
    private readonly groupModel;
    private readonly matchModel;
    private readonly logger;
    constructor(tournamentModel: Model<TournamentDocument>, participantModel: Model<TournamentParticipantDocument>, groupModel: Model<TournamentGroupDocument>, matchModel: Model<TournamentMatchDocument>);
    private seededShuffle;
    private buildGroupBracketDefs;
    private buildLegacyTenPlayerGroupBracket;
    private bracketSeedOrder;
    private finalsRoundName;
    private buildFinalsDefs;
    generateGroupsAndBrackets(tournament: TournamentDocument): Promise<void>;
    generateFinalsBracket(tournament: TournamentDocument): Promise<void>;
}
