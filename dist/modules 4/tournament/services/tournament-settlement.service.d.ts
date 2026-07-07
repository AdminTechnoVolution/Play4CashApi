import { Model, Types } from 'mongoose';
import { TournamentDocument } from '../schemas/tournament.schema';
import { TournamentParticipantDocument } from '../schemas/tournament-participant.schema';
import { TournamentLedgerService } from './tournament-ledger.service';
export declare class TournamentSettlementService {
    private readonly tournamentModel;
    private readonly participantModel;
    private readonly ledger;
    private readonly logger;
    constructor(tournamentModel: Model<TournamentDocument>, participantModel: Model<TournamentParticipantDocument>, ledger: TournamentLedgerService);
    settle(tournament: TournamentDocument, winnerUserId: Types.ObjectId, runnerUpUserId: Types.ObjectId): Promise<void>;
}
