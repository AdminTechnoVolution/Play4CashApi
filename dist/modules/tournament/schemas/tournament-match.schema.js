"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TournamentMatchSchema = exports.TournamentMatch = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const tournament_constants_1 = require("../constants/tournament.constants");
let TournamentMatch = class TournamentMatch {
    tournament_id;
    group_number;
    phase;
    round_name;
    round_index;
    match_index;
    status;
    player_a_user_id;
    player_b_user_id;
    winner_user_id;
    loser_user_id;
    room_id;
    next_match_id;
    next_slot;
    is_bye;
    starts_at;
    presence_check_at;
    started_at;
    finished_at;
    result_reason;
};
exports.TournamentMatch = TournamentMatch;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'Tournament', required: true, index: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], TournamentMatch.prototype, "tournament_id", void 0);
__decorate([
    (0, mongoose_1.Prop)({ min: 1, max: 5 }),
    __metadata("design:type", Number)
], TournamentMatch.prototype, "group_number", void 0);
__decorate([
    (0, mongoose_1.Prop)({
        type: String,
        enum: Object.values(tournament_constants_1.TournamentPhase),
        default: tournament_constants_1.TournamentPhase.GROUPS,
    }),
    __metadata("design:type", String)
], TournamentMatch.prototype, "phase", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: String, enum: Object.values(tournament_constants_1.TournamentMatchRoundName), required: true }),
    __metadata("design:type", String)
], TournamentMatch.prototype, "round_name", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, min: 0 }),
    __metadata("design:type", Number)
], TournamentMatch.prototype, "round_index", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, min: 0 }),
    __metadata("design:type", Number)
], TournamentMatch.prototype, "match_index", void 0);
__decorate([
    (0, mongoose_1.Prop)({
        type: String,
        enum: Object.values(tournament_constants_1.TournamentMatchStatus),
        default: tournament_constants_1.TournamentMatchStatus.PENDING,
    }),
    __metadata("design:type", String)
], TournamentMatch.prototype, "status", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User' }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], TournamentMatch.prototype, "player_a_user_id", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User' }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], TournamentMatch.prototype, "player_b_user_id", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User' }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], TournamentMatch.prototype, "winner_user_id", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User' }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], TournamentMatch.prototype, "loser_user_id", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'Room' }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], TournamentMatch.prototype, "room_id", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'TournamentMatch' }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], TournamentMatch.prototype, "next_match_id", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: String, enum: ['A', 'B'] }),
    __metadata("design:type", String)
], TournamentMatch.prototype, "next_slot", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: false }),
    __metadata("design:type", Boolean)
], TournamentMatch.prototype, "is_bye", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Date }),
    __metadata("design:type", Date)
], TournamentMatch.prototype, "starts_at", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Date }),
    __metadata("design:type", Date)
], TournamentMatch.prototype, "presence_check_at", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Date }),
    __metadata("design:type", Date)
], TournamentMatch.prototype, "started_at", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Date }),
    __metadata("design:type", Date)
], TournamentMatch.prototype, "finished_at", void 0);
__decorate([
    (0, mongoose_1.Prop)({ trim: true }),
    __metadata("design:type", String)
], TournamentMatch.prototype, "result_reason", void 0);
exports.TournamentMatch = TournamentMatch = __decorate([
    (0, mongoose_1.Schema)({ versionKey: false, timestamps: true })
], TournamentMatch);
exports.TournamentMatchSchema = mongoose_1.SchemaFactory.createForClass(TournamentMatch);
exports.TournamentMatchSchema.index({ tournament_id: 1, round_index: 1, status: 1 });
exports.TournamentMatchSchema.index({ tournament_id: 1, phase: 1, round_name: 1 });
//# sourceMappingURL=tournament-match.schema.js.map