import { Model } from 'mongoose';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { TournamentDocument } from '../schemas/tournament.schema';
import { TournamentParticipantDocument } from '../schemas/tournament-participant.schema';
import { TournamentStatus } from '../constants/tournament.constants';
import { TournamentLedgerService } from './tournament-ledger.service';
import { UserDocument } from '../../user/schemas/user.schema';
export declare class TournamentRegistrationService {
    private readonly tournamentModel;
    private readonly participantModel;
    private readonly userModel;
    private readonly ledger;
    private readonly idempotency;
    constructor(tournamentModel: Model<TournamentDocument>, participantModel: Model<TournamentParticipantDocument>, userModel: Model<UserDocument>, ledger: TournamentLedgerService, idempotency: IdempotencyService);
    private static readonly UUID_RE;
    private assertIdempotencyKey;
    register(tournamentId: string, userId: string, idempotencyKeyHeader: string | undefined): Promise<{
        registered: boolean;
        participantId: string;
        alreadyRegistered: boolean;
        seed?: undefined;
        groupNumber?: undefined;
        registeredCount?: undefined;
        status?: undefined;
    } | {
        registered: boolean;
        participantId: string;
        seed: number;
        groupNumber: number;
        registeredCount: number;
        status: TournamentStatus.OPEN | TournamentStatus.FULL | TournamentStatus.COUNTDOWN;
        alreadyRegistered?: undefined;
    }>;
    unregister(tournamentId: string, userId: string, idempotencyKeyHeader: string | undefined): Promise<{
        unregistered: boolean;
        registeredCount: number;
        status: TournamentStatus.OPEN;
    }>;
}
