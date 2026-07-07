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
exports.ConnectFourGameSchema = exports.ConnectFourGame = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
let ConnectFourGame = class ConnectFourGame {
    room_id;
    player1_id;
    player2_id;
    board;
    current_player;
    winning_cells;
    turn_start_time;
};
exports.ConnectFourGame = ConnectFourGame;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Schema.Types.ObjectId, ref: 'Room', required: true, unique: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], ConnectFourGame.prototype, "room_id", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Schema.Types.ObjectId, ref: 'User', required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], ConnectFourGame.prototype, "player1_id", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Schema.Types.ObjectId, ref: 'User', required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], ConnectFourGame.prototype, "player2_id", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [[mongoose_2.Schema.Types.Mixed]], required: true }),
    __metadata("design:type", Array)
], ConnectFourGame.prototype, "board", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Number, enum: [1, 2], default: 1 }),
    __metadata("design:type", Number)
], ConnectFourGame.prototype, "current_player", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [{ row: { type: Number }, col: { type: Number } }], default: [] }),
    __metadata("design:type", Array)
], ConnectFourGame.prototype, "winning_cells", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Date, default: Date.now }),
    __metadata("design:type", Date)
], ConnectFourGame.prototype, "turn_start_time", void 0);
exports.ConnectFourGame = ConnectFourGame = __decorate([
    (0, mongoose_1.Schema)({ versionKey: false, timestamps: true })
], ConnectFourGame);
exports.ConnectFourGameSchema = mongoose_1.SchemaFactory.createForClass(ConnectFourGame);
//# sourceMappingURL=connect-four-game.schema.js.map