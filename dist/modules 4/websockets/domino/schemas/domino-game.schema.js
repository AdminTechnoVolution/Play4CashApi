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
exports.DominoGameSchema = exports.DominoGame = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
let OpenEnds = class OpenEnds {
    left;
    right;
};
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Number)
], OpenEnds.prototype, "left", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Number)
], OpenEnds.prototype, "right", void 0);
OpenEnds = __decorate([
    (0, mongoose_1.Schema)({ _id: false })
], OpenEnds);
let DominoGame = class DominoGame {
    room_id;
    player_ids;
    hands;
    board;
    boneyard;
    current_player_index;
    open_ends;
    turn_start_time;
    status;
    consecutive_passes;
    eliminated_players;
};
exports.DominoGame = DominoGame;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Schema.Types.ObjectId, ref: 'Room', required: true, unique: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], DominoGame.prototype, "room_id", void 0);
__decorate([
    (0, mongoose_1.Prop)([{ type: mongoose_2.Schema.Types.ObjectId, ref: 'User', required: true }]),
    __metadata("design:type", Array)
], DominoGame.prototype, "player_ids", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Map, of: [[Number]], required: true }),
    __metadata("design:type", Map)
], DominoGame.prototype, "hands", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [[Number]], default: [] }),
    __metadata("design:type", Array)
], DominoGame.prototype, "board", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [[Number]], default: [] }),
    __metadata("design:type", Array)
], DominoGame.prototype, "boneyard", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Number, default: 0 }),
    __metadata("design:type", Number)
], DominoGame.prototype, "current_player_index", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: OpenEnds, _id: false }),
    __metadata("design:type", OpenEnds)
], DominoGame.prototype, "open_ends", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Date, default: Date.now }),
    __metadata("design:type", Date)
], DominoGame.prototype, "turn_start_time", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: String, enum: ['active', 'blocked', 'finished'], default: 'active' }),
    __metadata("design:type", String)
], DominoGame.prototype, "status", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Number, default: 0 }),
    __metadata("design:type", Number)
], DominoGame.prototype, "consecutive_passes", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [String], default: [] }),
    __metadata("design:type", Array)
], DominoGame.prototype, "eliminated_players", void 0);
exports.DominoGame = DominoGame = __decorate([
    (0, mongoose_1.Schema)({ versionKey: '__v', timestamps: true, optimisticConcurrency: true })
], DominoGame);
exports.DominoGameSchema = mongoose_1.SchemaFactory.createForClass(DominoGame);
//# sourceMappingURL=domino-game.schema.js.map