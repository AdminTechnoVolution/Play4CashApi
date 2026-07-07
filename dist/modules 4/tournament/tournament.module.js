"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TournamentModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const tournament_schema_1 = require("./schemas/tournament.schema");
const tournament_participant_schema_1 = require("./schemas/tournament-participant.schema");
const tournament_group_schema_1 = require("./schemas/tournament-group.schema");
const tournament_match_schema_1 = require("./schemas/tournament-match.schema");
const tournament_transaction_schema_1 = require("./schemas/tournament-transaction.schema");
const tournament_admin_controller_1 = require("./controllers/tournament-admin.controller");
const tournament_controller_1 = require("./controllers/tournament.controller");
const tournament_admin_service_1 = require("./services/tournament-admin.service");
const tournament_registration_service_1 = require("./services/tournament-registration.service");
const tournament_ledger_service_1 = require("./services/tournament-ledger.service");
const tournament_state_service_1 = require("./services/tournament-state.service");
const tournament_bracket_service_1 = require("./services/tournament-bracket.service");
const tournament_match_service_1 = require("./services/tournament-match.service");
const tournament_scheduler_service_1 = require("./services/tournament-scheduler.service");
const tournament_presence_service_1 = require("./services/tournament-presence.service");
const tournament_settlement_service_1 = require("./services/tournament-settlement.service");
const game_schema_1 = require("../game/schemas/game.schema");
const user_schema_1 = require("../user/schemas/user.schema");
const room_schema_1 = require("../room/schemas/room.schema");
const idempotency_module_1 = require("../../common/idempotency/idempotency.module");
const tournaments_gateway_1 = require("../websockets/tournaments/tournaments.gateway");
let TournamentModule = class TournamentModule {
};
exports.TournamentModule = TournamentModule;
exports.TournamentModule = TournamentModule = __decorate([
    (0, common_1.Module)({
        imports: [
            idempotency_module_1.IdempotencyModule,
            mongoose_1.MongooseModule.forFeature([
                { name: tournament_schema_1.Tournament.name, schema: tournament_schema_1.TournamentSchema },
                { name: tournament_participant_schema_1.TournamentParticipant.name, schema: tournament_participant_schema_1.TournamentParticipantSchema },
                { name: tournament_group_schema_1.TournamentGroup.name, schema: tournament_group_schema_1.TournamentGroupSchema },
                { name: tournament_match_schema_1.TournamentMatch.name, schema: tournament_match_schema_1.TournamentMatchSchema },
                { name: tournament_transaction_schema_1.TournamentTransaction.name, schema: tournament_transaction_schema_1.TournamentTransactionSchema },
                { name: game_schema_1.Game.name, schema: game_schema_1.GameSchema },
                { name: user_schema_1.User.name, schema: user_schema_1.UserSchema },
                { name: room_schema_1.Room.name, schema: room_schema_1.RoomSchema },
            ]),
        ],
        controllers: [tournament_admin_controller_1.TournamentAdminController, tournament_controller_1.TournamentController],
        providers: [
            tournament_admin_service_1.TournamentAdminService,
            tournament_registration_service_1.TournamentRegistrationService,
            tournament_ledger_service_1.TournamentLedgerService,
            tournament_state_service_1.TournamentStateService,
            tournament_bracket_service_1.TournamentBracketService,
            tournament_match_service_1.TournamentMatchService,
            tournament_scheduler_service_1.TournamentSchedulerService,
            tournament_presence_service_1.TournamentPresenceService,
            tournament_settlement_service_1.TournamentSettlementService,
            tournaments_gateway_1.TournamentsGateway,
        ],
        exports: [
            tournament_match_service_1.TournamentMatchService,
            tournament_state_service_1.TournamentStateService,
            tournaments_gateway_1.TournamentsGateway,
        ],
    })
], TournamentModule);
//# sourceMappingURL=tournament.module.js.map