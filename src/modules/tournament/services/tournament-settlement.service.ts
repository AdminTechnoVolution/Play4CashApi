import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Tournament, TournamentDocument } from '../schemas/tournament.schema';
import {
  TournamentParticipant,
  TournamentParticipantDocument,
} from '../schemas/tournament-participant.schema';
import {
  TournamentParticipantStatus,
  TournamentStatus,
} from '../constants/tournament.constants';
import { TournamentLedgerService } from './tournament-ledger.service';
import { TournamentTransactionType } from '../constants/tournament.constants';

@Injectable()
export class TournamentSettlementService {
  private readonly logger = new Logger(TournamentSettlementService.name);

  constructor(
    @InjectModel(Tournament.name) private readonly tournamentModel: Model<TournamentDocument>,
    @InjectModel(TournamentParticipant.name)
    private readonly participantModel: Model<TournamentParticipantDocument>,
    private readonly ledger: TournamentLedgerService,
  ) {}

  async settle(
    tournament: TournamentDocument,
    winnerUserId: Types.ObjectId,
    runnerUpUserId: Types.ObjectId,
  ): Promise<void> {
    const updated = await this.tournamentModel.findOneAndUpdate(
      { _id: tournament._id, prizes_settled: { $ne: true }, status: { $ne: TournamentStatus.FINISHED } },
      {
        $set: {
          status: TournamentStatus.FINISHED,
          prizes_settled: true,
          finished_at: new Date(),
          winner_user_id: winnerUserId,
          runner_up_user_id: runnerUpUserId,
        },
      },
      { returnDocument: 'after' },
    );

    if (!updated) return;

    const gross = updated.gross_prize_pool;
    const houseAmount = Math.round(gross * (updated.house_fee_percent / 100) * 100) / 100;
    const firstAmount = Math.round(gross * (updated.first_place_percent / 100) * 100) / 100;
    const secondAmount = Math.round((gross - houseAmount - firstAmount) * 100) / 100;

    updated.house_amount = houseAmount;
    updated.first_place_amount = firstAmount;
    updated.second_place_amount = secondAmount;
    await updated.save();

    const tid = updated._id as Types.ObjectId;
    await this.ledger.recordHouseFee(tid, houseAmount, `idem:tournament:fee:house:${tid}`);
    await this.ledger.creditPrize(
      tid,
      winnerUserId,
      firstAmount,
      TournamentTransactionType.FIRST_PLACE_PRIZE,
      `idem:tournament:prize:first:${tid}`,
    );
    await this.ledger.creditPrize(
      tid,
      runnerUpUserId,
      secondAmount,
      TournamentTransactionType.SECOND_PLACE_PRIZE,
      `idem:tournament:prize:second:${tid}`,
    );

    await this.participantModel.updateOne(
      { tournament_id: tid, user_id: winnerUserId },
      { $set: { status: TournamentParticipantStatus.WINNER, final_rank: 1 } },
    );
    await this.participantModel.updateOne(
      { tournament_id: tid, user_id: runnerUpUserId },
      { $set: { status: TournamentParticipantStatus.RUNNER_UP, final_rank: 2 } },
    );

    this.logger.log(`event=tournament_settled tournament=${tid} gross=${gross}`);
  }
}
