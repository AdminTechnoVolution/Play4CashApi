import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Tournament, TournamentSchema } from './schemas/tournament.schema';
import {
  TournamentParticipant,
  TournamentParticipantSchema,
} from './schemas/tournament-participant.schema';
import { TournamentGroup, TournamentGroupSchema } from './schemas/tournament-group.schema';
import { TournamentMatch, TournamentMatchSchema } from './schemas/tournament-match.schema';
import {
  TournamentTransaction,
  TournamentTransactionSchema,
} from './schemas/tournament-transaction.schema';
import { TournamentAdminController } from './controllers/tournament-admin.controller';
import { TournamentController } from './controllers/tournament.controller';
import { TournamentAdminService } from './services/tournament-admin.service';
import { TournamentRegistrationService } from './services/tournament-registration.service';
import { TournamentLedgerService } from './services/tournament-ledger.service';
import { TournamentStateService } from './services/tournament-state.service';
import { TournamentBracketService } from './services/tournament-bracket.service';
import { TournamentMatchService } from './services/tournament-match.service';
import { TournamentSchedulerService } from './services/tournament-scheduler.service';
import { TournamentPresenceService } from './services/tournament-presence.service';
import { TournamentSettlementService } from './services/tournament-settlement.service';
import { Game, GameSchema } from '../game/schemas/game.schema';
import { User, UserSchema } from '../user/schemas/user.schema';
import { Room, RoomSchema } from '../room/schemas/room.schema';
import { IdempotencyModule } from '../../common/idempotency/idempotency.module';
import { TournamentsGateway } from '../websockets/tournaments/tournaments.gateway';

@Module({
  imports: [
    IdempotencyModule,
    MongooseModule.forFeature([
      { name: Tournament.name, schema: TournamentSchema },
      { name: TournamentParticipant.name, schema: TournamentParticipantSchema },
      { name: TournamentGroup.name, schema: TournamentGroupSchema },
      { name: TournamentMatch.name, schema: TournamentMatchSchema },
      { name: TournamentTransaction.name, schema: TournamentTransactionSchema },
      { name: Game.name, schema: GameSchema },
      { name: User.name, schema: UserSchema },
      { name: Room.name, schema: RoomSchema },
    ]),
  ],
  controllers: [TournamentAdminController, TournamentController],
  providers: [
    TournamentAdminService,
    TournamentRegistrationService,
    TournamentLedgerService,
    TournamentStateService,
    TournamentBracketService,
    TournamentMatchService,
    TournamentSchedulerService,
    TournamentPresenceService,
    TournamentSettlementService,
    TournamentsGateway,
  ],
  exports: [
    TournamentMatchService,
    TournamentStateService,
    TournamentsGateway,
  ],
})
export class TournamentModule {}
