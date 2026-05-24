import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
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
import { User, UserDocument } from '../../user/schemas/user.schema';

@Injectable()
export class TournamentRegistrationService {
  constructor(
    @InjectModel(Tournament.name) private readonly tournamentModel: Model<TournamentDocument>,
    @InjectModel(TournamentParticipant.name)
    private readonly participantModel: Model<TournamentParticipantDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly ledger: TournamentLedgerService,
    private readonly idempotency: IdempotencyService,
  ) {}

  private static readonly UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  private assertIdempotencyKey(key: string | undefined): string {
    if (!key || !TournamentRegistrationService.UUID_RE.test(key.trim())) {
      throw new BadRequestException('Valid Idempotency-Key header required');
    }
    return key.trim();
  }

  async register(
    tournamentId: string,
    userId: string,
    idempotencyKeyHeader: string | undefined,
  ) {
    const idempKey = this.assertIdempotencyKey(idempotencyKeyHeader);
    const cacheKey = `idem:tournament:register:${userId}:${idempKey}`;

    return this.idempotency.getOrSet(cacheKey, IdempotencyService.DEFAULT_TTL_SEC, async () => {
      const t = await this.tournamentModel.findById(tournamentId);
      if (!t) throw new NotFoundException('Tournament not found');
      if (t.status !== TournamentStatus.OPEN && t.status !== TournamentStatus.FULL) {
        throw new BadRequestException('Tournament not open for registration');
      }
      if (t.registered_count >= t.max_players) {
        throw new ConflictException('Tournament is full');
      }

      const existing = await this.participantModel.findOne({
        tournament_id: t._id,
        user_id: new Types.ObjectId(userId),
      });
      if (existing) {
        return { registered: true, participantId: existing._id.toString(), alreadyRegistered: true };
      }

      const user = await this.userModel.findById(userId).select('username balance');
      if (!user) throw new NotFoundException('User not found');

      const txKey = `idem:tournament:reg-tx:${t._id}:${userId}:${idempKey}`;
      try {
        await this.ledger.debitRegistration(t._id as Types.ObjectId, user._id as Types.ObjectId, t.buy_in, txKey);
      } catch {
        throw new BadRequestException('Insufficient balance');
      }

      const seed = t.registered_count + 1;
      const groupNumber = ((seed - 1) % t.group_count) + 1;

      const participant = await this.participantModel.create({
        tournament_id: t._id,
        user_id: user._id,
        username: user.username,
        status: TournamentParticipantStatus.REGISTERED,
        seed,
        group_number: groupNumber,
        registered_at: new Date(),
      });

      t.registered_count += 1;
      t.gross_prize_pool += t.buy_in;

      if (t.registered_count >= t.max_players) {
        t.status =
          t.starts_at.getTime() > Date.now() ? TournamentStatus.COUNTDOWN : TournamentStatus.FULL;
      }
      await t.save();

      return {
        registered: true,
        participantId: participant._id.toString(),
        seed,
        groupNumber,
        registeredCount: t.registered_count,
        status: t.status,
      };
    });
  }

  async unregister(
    tournamentId: string,
    userId: string,
    idempotencyKeyHeader: string | undefined,
  ) {
    const idempKey = this.assertIdempotencyKey(idempotencyKeyHeader);
    const cacheKey = `idem:tournament:unregister:${userId}:${idempKey}`;

    return this.idempotency.getOrSet(cacheKey, IdempotencyService.DEFAULT_TTL_SEC, async () => {
      const t = await this.tournamentModel.findById(tournamentId);
      if (!t) throw new NotFoundException('Tournament not found');
      if (t.status !== TournamentStatus.OPEN && t.status !== TournamentStatus.FULL && t.status !== TournamentStatus.COUNTDOWN) {
        throw new BadRequestException('Cannot unregister at this stage');
      }

      const participant = await this.participantModel.findOne({
        tournament_id: t._id,
        user_id: new Types.ObjectId(userId),
      });
      if (!participant) throw new NotFoundException('Not registered');

      const txKey = `idem:tournament:unreg-tx:${t._id}:${userId}:${idempKey}`;
      await this.ledger.refundRegistration(
        t._id as Types.ObjectId,
        participant.user_id as Types.ObjectId,
        t.buy_in,
        txKey,
      );

      participant.status = TournamentParticipantStatus.REFUNDED;
      await participant.deleteOne();

      t.registered_count = Math.max(0, t.registered_count - 1);
      t.gross_prize_pool = Math.max(0, t.gross_prize_pool - t.buy_in);
      if (t.status === TournamentStatus.FULL || t.status === TournamentStatus.COUNTDOWN) {
        t.status = TournamentStatus.OPEN;
      }
      await t.save();

      return { unregistered: true, registeredCount: t.registered_count, status: t.status };
    });
  }
}
