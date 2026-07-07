"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TournamentTransactionType = exports.TournamentPhase = exports.TournamentMatchRoundName = exports.TournamentMatchStatus = exports.TournamentParticipantStatus = exports.TournamentStatus = exports.TOURNAMENT_SUPPORTED_SOCKET_CODES = exports.TOURNAMENT_GROUP_COUNT = exports.TOURNAMENT_MVP_PLAYER_COUNT = exports.TOURNAMENT_MAX_PLAYERS = exports.TOURNAMENT_MIN_PLAYERS = exports.TOURNAMENT_GROUP_SIZE = void 0;
exports.TOURNAMENT_GROUP_SIZE = 2;
exports.TOURNAMENT_MIN_PLAYERS = 2;
exports.TOURNAMENT_MAX_PLAYERS = 1000;
exports.TOURNAMENT_MVP_PLAYER_COUNT = 50;
exports.TOURNAMENT_GROUP_COUNT = 5;
exports.TOURNAMENT_SUPPORTED_SOCKET_CODES = [
    'connect-four',
    'chess',
    'halma',
    'naval-battle',
    'battleship',
];
var TournamentStatus;
(function (TournamentStatus) {
    TournamentStatus["DRAFT"] = "draft";
    TournamentStatus["OPEN"] = "open";
    TournamentStatus["FULL"] = "full";
    TournamentStatus["COUNTDOWN"] = "countdown";
    TournamentStatus["LOCKING"] = "locking";
    TournamentStatus["RUNNING"] = "running";
    TournamentStatus["BETWEEN_ROUNDS"] = "between_rounds";
    TournamentStatus["FINALS_PENDING"] = "finals_pending";
    TournamentStatus["FINALS_RUNNING"] = "finals_running";
    TournamentStatus["FINISHED"] = "finished";
    TournamentStatus["CANCELLED"] = "cancelled";
})(TournamentStatus || (exports.TournamentStatus = TournamentStatus = {}));
var TournamentParticipantStatus;
(function (TournamentParticipantStatus) {
    TournamentParticipantStatus["REGISTERED"] = "registered";
    TournamentParticipantStatus["ACTIVE"] = "active";
    TournamentParticipantStatus["ELIMINATED"] = "eliminated";
    TournamentParticipantStatus["GROUP_WINNER"] = "group_winner";
    TournamentParticipantStatus["FINALIST"] = "finalist";
    TournamentParticipantStatus["WINNER"] = "winner";
    TournamentParticipantStatus["RUNNER_UP"] = "runner_up";
    TournamentParticipantStatus["FORFEITED"] = "forfeited";
    TournamentParticipantStatus["REFUNDED"] = "refunded";
})(TournamentParticipantStatus || (exports.TournamentParticipantStatus = TournamentParticipantStatus = {}));
var TournamentMatchStatus;
(function (TournamentMatchStatus) {
    TournamentMatchStatus["PENDING"] = "pending";
    TournamentMatchStatus["READY"] = "ready";
    TournamentMatchStatus["WAITING_PRESENCE"] = "waiting_presence";
    TournamentMatchStatus["STARTED"] = "started";
    TournamentMatchStatus["FINISHED"] = "finished";
    TournamentMatchStatus["FORFEITED"] = "forfeited";
    TournamentMatchStatus["CANCELLED"] = "cancelled";
})(TournamentMatchStatus || (exports.TournamentMatchStatus = TournamentMatchStatus = {}));
var TournamentMatchRoundName;
(function (TournamentMatchRoundName) {
    TournamentMatchRoundName["PRELIMINARY"] = "preliminary";
    TournamentMatchRoundName["QUARTERFINAL"] = "quarterfinal";
    TournamentMatchRoundName["SEMIFINAL"] = "semifinal";
    TournamentMatchRoundName["GROUP_FINAL"] = "group_final";
    TournamentMatchRoundName["FINALS_PLAYIN"] = "finals_playin";
    TournamentMatchRoundName["FINALS_SEMIFINAL"] = "finals_semifinal";
    TournamentMatchRoundName["GRAND_FINAL"] = "grand_final";
})(TournamentMatchRoundName || (exports.TournamentMatchRoundName = TournamentMatchRoundName = {}));
var TournamentPhase;
(function (TournamentPhase) {
    TournamentPhase["GROUPS"] = "groups";
    TournamentPhase["FINALS"] = "finals";
})(TournamentPhase || (exports.TournamentPhase = TournamentPhase = {}));
var TournamentTransactionType;
(function (TournamentTransactionType) {
    TournamentTransactionType["REGISTRATION_DEBIT"] = "registration_debit";
    TournamentTransactionType["REGISTRATION_REFUND"] = "registration_refund";
    TournamentTransactionType["HOUSE_FEE"] = "house_fee";
    TournamentTransactionType["FIRST_PLACE_PRIZE"] = "first_place_prize";
    TournamentTransactionType["SECOND_PLACE_PRIZE"] = "second_place_prize";
})(TournamentTransactionType || (exports.TournamentTransactionType = TournamentTransactionType = {}));
//# sourceMappingURL=tournament.constants.js.map