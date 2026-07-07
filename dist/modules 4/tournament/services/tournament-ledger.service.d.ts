import { Model, Types } from 'mongoose';
import { TournamentTransactionDocument } from '../schemas/tournament-transaction.schema';
import { TournamentTransactionType } from '../constants/tournament.constants';
import { UserDocument } from '../../user/schemas/user.schema';
export declare class TournamentLedgerService {
    private readonly txModel;
    private readonly userModel;
    private readonly logger;
    constructor(txModel: Model<TournamentTransactionDocument>, userModel: Model<UserDocument>);
    debitRegistration(tournamentId: Types.ObjectId, userId: Types.ObjectId, amount: number, idempotencyKey: string): Promise<void>;
    refundRegistration(tournamentId: Types.ObjectId, userId: Types.ObjectId, amount: number, idempotencyKey: string): Promise<void>;
    creditPrize(tournamentId: Types.ObjectId, userId: Types.ObjectId, amount: number, type: TournamentTransactionType.FIRST_PLACE_PRIZE | TournamentTransactionType.SECOND_PLACE_PRIZE, idempotencyKey: string): Promise<void>;
    recordHouseFee(tournamentId: Types.ObjectId, amount: number, idempotencyKey: string): Promise<void>;
    refundAllRegistered(tournamentId: Types.ObjectId, participants: Array<{
        user_id: Types.ObjectId;
        amount: number;
    }>): Promise<void>;
}
