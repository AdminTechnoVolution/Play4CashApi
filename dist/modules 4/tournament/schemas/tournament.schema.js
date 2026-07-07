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
exports.TournamentSchema = exports.Tournament = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const game_schema_1 = require("../../game/schemas/game.schema");
const tournament_constants_1 = require("../constants/tournament.constants");
let Tournament = class Tournament {
    title;
    description;
    game_id;
    game_socket_code;
    status;
    buy_in;
    max_players;
    min_players;
    group_count;
    group_size;
    registered_count;
    starts_at;
    registration_opens_at;
    registration_closes_at;
    house_fee_percent;
    first_place_percent;
    second_place_percent;
    gross_prize_pool;
    house_amount;
    first_place_amount;
    second_place_amount;
    winner_user_id;
    runner_up_user_id;
    turn_timer_seconds;
    between_rounds_pause_seconds;
    presence_window_seconds;
    rematch_delay_seconds;
    bracket_seed;
    current_phase;
    current_round_index;
    between_rounds_ends_at;
    presence_window_ends_at;
    prizes_settled;
    finished_at;
};
exports.Tournament = Tournament;
__decorate([
    (0, mongoose_1.Prop)({ type: game_schema_1.LanguageFieldSchema, _id: false, required: true }),
    __metadata("design:type", game_schema_1.LanguageField)
], Tournament.prototype, "title", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: game_schema_1.LanguageFieldSchema, _id: false, default: () => ({ en: '', es: '', fr: '', de: '', it: '', pt: '' }) }),
    __metadata("design:type", game_schema_1.LanguageField)
], Tournament.prototype, "description", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'Game', required: true, index: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], Tournament.prototype, "game_id", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, trim: true }),
    __metadata("design:type", String)
], Tournament.prototype, "game_socket_code", void 0);
__decorate([
    (0, mongoose_1.Prop)({
        type: String,
        enum: Object.values(tournament_constants_1.TournamentStatus),
        default: tournament_constants_1.TournamentStatus.DRAFT,
        index: true,
    }),
    __metadata("design:type", String)
], Tournament.prototype, "status", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, min: 0.01 }),
    __metadata("design:type", Number)
], Tournament.prototype, "buy_in", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, default: 8, min: tournament_constants_1.TOURNAMENT_MIN_PLAYERS }),
    __metadata("design:type", Number)
], Tournament.prototype, "max_players", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, default: 4, min: tournament_constants_1.TOURNAMENT_MIN_PLAYERS }),
    __metadata("design:type", Number)
], Tournament.prototype, "min_players", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, min: 1 }),
    __metadata("design:type", Number)
], Tournament.prototype, "group_count", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, default: tournament_constants_1.TOURNAMENT_GROUP_SIZE, min: tournament_constants_1.TOURNAMENT_GROUP_SIZE, max: tournament_constants_1.TOURNAMENT_GROUP_SIZE }),
    __metadata("design:type", Number)
], Tournament.prototype, "group_size", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0, min: 0 }),
    __metadata("design:type", Number)
], Tournament.prototype, "registered_count", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, type: Date }),
    __metadata("design:type", Date)
], Tournament.prototype, "starts_at", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Date }),
    __metadata("design:type", Date)
], Tournament.prototype, "registration_opens_at", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Date }),
    __metadata("design:type", Date)
], Tournament.prototype, "registration_closes_at", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 10, min: 0, max: 100 }),
    __metadata("design:type", Number)
], Tournament.prototype, "house_fee_percent", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 70, min: 0, max: 100 }),
    __metadata("design:type", Number)
], Tournament.prototype, "first_place_percent", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 20, min: 0, max: 100 }),
    __metadata("design:type", Number)
], Tournament.prototype, "second_place_percent", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0, min: 0 }),
    __metadata("design:type", Number)
], Tournament.prototype, "gross_prize_pool", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0, min: 0 }),
    __metadata("design:type", Number)
], Tournament.prototype, "house_amount", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0, min: 0 }),
    __metadata("design:type", Number)
], Tournament.prototype, "first_place_amount", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0, min: 0 }),
    __metadata("design:type", Number)
], Tournament.prototype, "second_place_amount", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User' }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], Tournament.prototype, "winner_user_id", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User' }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], Tournament.prototype, "runner_up_user_id", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 30, min: 15, max: 180 }),
    __metadata("design:type", Number)
], Tournament.prototype, "turn_timer_seconds", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 300, min: 60, max: 900 }),
    __metadata("design:type", Number)
], Tournament.prototype, "between_rounds_pause_seconds", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 90, min: 30, max: 180 }),
    __metadata("design:type", Number)
], Tournament.prototype, "presence_window_seconds", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 60, min: 30, max: 300 }),
    __metadata("design:type", Number)
], Tournament.prototype, "rematch_delay_seconds", void 0);
__decorate([
    (0, mongoose_1.Prop)({ trim: true }),
    __metadata("design:type", String)
], Tournament.prototype, "bracket_seed", void 0);
__decorate([
    (0, mongoose_1.Prop)({
        type: String,
        enum: Object.values(tournament_constants_1.TournamentPhase),
        default: tournament_constants_1.TournamentPhase.GROUPS,
    }),
    __metadata("design:type", String)
], Tournament.prototype, "current_phase", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 0, min: 0 }),
    __metadata("design:type", Number)
], Tournament.prototype, "current_round_index", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Date }),
    __metadata("design:type", Date)
], Tournament.prototype, "between_rounds_ends_at", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Date }),
    __metadata("design:type", Date)
], Tournament.prototype, "presence_window_ends_at", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: false }),
    __metadata("design:type", Boolean)
], Tournament.prototype, "prizes_settled", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Date }),
    __metadata("design:type", Date)
], Tournament.prototype, "finished_at", void 0);
exports.Tournament = Tournament = __decorate([
    (0, mongoose_1.Schema)({ versionKey: false, timestamps: true })
], Tournament);
exports.TournamentSchema = mongoose_1.SchemaFactory.createForClass(Tournament);
exports.TournamentSchema.index({ status: 1, starts_at: 1 });
//# sourceMappingURL=tournament.schema.js.map