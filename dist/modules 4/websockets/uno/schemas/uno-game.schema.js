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
exports.UnoGameSchema = exports.UnoGame = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
let UnoGame = class UnoGame {
    room_id;
    player_ids;
    hands;
    draw_pile;
    discard_pile;
    current_player_index;
    direction;
    current_color;
    draw_stack_pending;
    eliminated_players;
    turn_start_time;
    uno_called;
    pending_uno_offender;
    last_action_player_id;
    match_scores;
    round_number;
    match_target_score;
    match_winner_id;
    between_rounds;
    next_round_starts_at;
    between_rounds_processing;
    players_ready_for_next;
    round_history;
};
exports.UnoGame = UnoGame;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Schema.Types.ObjectId, ref: 'Room', required: true, unique: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], UnoGame.prototype, "room_id", void 0);
__decorate([
    (0, mongoose_1.Prop)([{ type: mongoose_2.Schema.Types.ObjectId, ref: 'User', required: true }]),
    __metadata("design:type", Array)
], UnoGame.prototype, "player_ids", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Map, of: [String], required: true }),
    __metadata("design:type", Map)
], UnoGame.prototype, "hands", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [String], default: [] }),
    __metadata("design:type", Array)
], UnoGame.prototype, "draw_pile", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [String], default: [] }),
    __metadata("design:type", Array)
], UnoGame.prototype, "discard_pile", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Number, default: 0 }),
    __metadata("design:type", Number)
], UnoGame.prototype, "current_player_index", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Number, enum: [1, -1], default: 1 }),
    __metadata("design:type", Number)
], UnoGame.prototype, "direction", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: String, required: true }),
    __metadata("design:type", String)
], UnoGame.prototype, "current_color", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Number, default: 0 }),
    __metadata("design:type", Number)
], UnoGame.prototype, "draw_stack_pending", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [String], default: [] }),
    __metadata("design:type", Array)
], UnoGame.prototype, "eliminated_players", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Date, default: Date.now }),
    __metadata("design:type", Date)
], UnoGame.prototype, "turn_start_time", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [String], default: [] }),
    __metadata("design:type", Array)
], UnoGame.prototype, "uno_called", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: String, default: null }),
    __metadata("design:type", Object)
], UnoGame.prototype, "pending_uno_offender", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: String, default: null }),
    __metadata("design:type", Object)
], UnoGame.prototype, "last_action_player_id", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Map, of: Number, default: {} }),
    __metadata("design:type", Map)
], UnoGame.prototype, "match_scores", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Number, default: 1 }),
    __metadata("design:type", Number)
], UnoGame.prototype, "round_number", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Number, default: 200 }),
    __metadata("design:type", Number)
], UnoGame.prototype, "match_target_score", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: String, default: null }),
    __metadata("design:type", Object)
], UnoGame.prototype, "match_winner_id", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Boolean, default: false }),
    __metadata("design:type", Boolean)
], UnoGame.prototype, "between_rounds", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Date, default: null }),
    __metadata("design:type", Object)
], UnoGame.prototype, "next_round_starts_at", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Boolean, default: false }),
    __metadata("design:type", Boolean)
], UnoGame.prototype, "between_rounds_processing", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [String], default: [] }),
    __metadata("design:type", Array)
], UnoGame.prototype, "players_ready_for_next", void 0);
__decorate([
    (0, mongoose_1.Prop)({
        type: [
            {
                round: { type: Number, required: true },
                winnerId: { type: String, required: true },
                scoreDealt: { type: Number, required: true },
                endedAt: { type: Date, default: Date.now },
            },
        ],
        default: [],
    }),
    __metadata("design:type", Array)
], UnoGame.prototype, "round_history", void 0);
exports.UnoGame = UnoGame = __decorate([
    (0, mongoose_1.Schema)({ versionKey: '__v', timestamps: true, optimisticConcurrency: true })
], UnoGame);
exports.UnoGameSchema = mongoose_1.SchemaFactory.createForClass(UnoGame);
//# sourceMappingURL=uno-game.schema.js.map