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
exports.ChessGameSchema = exports.ChessGame = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
let ChessGame = class ChessGame {
    room_id;
    player1_id;
    player2_id;
    board;
    current_player;
    castling_rights;
    en_passant_target;
    history;
    turn_start_time;
};
exports.ChessGame = ChessGame;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Schema.Types.ObjectId, ref: 'Room', required: true, unique: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], ChessGame.prototype, "room_id", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Schema.Types.ObjectId, ref: 'User', required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], ChessGame.prototype, "player1_id", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Schema.Types.ObjectId, ref: 'User', required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], ChessGame.prototype, "player2_id", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [[mongoose_2.Schema.Types.Mixed]], required: true }),
    __metadata("design:type", Array)
], ChessGame.prototype, "board", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Number, enum: [1, 2], default: 1 }),
    __metadata("design:type", Number)
], ChessGame.prototype, "current_player", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Schema.Types.Mixed, default: { wK: true, wQ: true, bK: true, bQ: true } }),
    __metadata("design:type", Object)
], ChessGame.prototype, "castling_rights", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Schema.Types.Mixed, default: null }),
    __metadata("design:type", Object)
], ChessGame.prototype, "en_passant_target", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [mongoose_2.Schema.Types.Mixed], default: [] }),
    __metadata("design:type", Array)
], ChessGame.prototype, "history", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Date, default: Date.now }),
    __metadata("design:type", Date)
], ChessGame.prototype, "turn_start_time", void 0);
exports.ChessGame = ChessGame = __decorate([
    (0, mongoose_1.Schema)({ versionKey: false, timestamps: true })
], ChessGame);
exports.ChessGameSchema = mongoose_1.SchemaFactory.createForClass(ChessGame);
//# sourceMappingURL=chess-game.schema.js.map