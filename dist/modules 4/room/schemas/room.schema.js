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
exports.RoomSchema = exports.Room = exports.RoomStatus = exports.RoomPlayer = exports.Move = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
let Move = class Move {
    data;
};
exports.Move = Move;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Schema.Types.Mixed, default: {} }),
    __metadata("design:type", Object)
], Move.prototype, "data", void 0);
exports.Move = Move = __decorate([
    (0, mongoose_1.Schema)({ _id: false })
], Move);
let RoomPlayer = class RoomPlayer {
    playerId;
    ready;
    moves;
};
exports.RoomPlayer = RoomPlayer;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User', required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], RoomPlayer.prototype, "playerId", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: false }),
    __metadata("design:type", Boolean)
], RoomPlayer.prototype, "ready", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [Move], default: [] }),
    __metadata("design:type", Array)
], RoomPlayer.prototype, "moves", void 0);
exports.RoomPlayer = RoomPlayer = __decorate([
    (0, mongoose_1.Schema)({ _id: false })
], RoomPlayer);
var RoomStatus;
(function (RoomStatus) {
    RoomStatus["WAITING"] = "waiting";
    RoomStatus["STARTED"] = "started";
    RoomStatus["FINISHED"] = "finished";
})(RoomStatus || (exports.RoomStatus = RoomStatus = {}));
let Room = class Room {
    name;
    code;
    game_id;
    players;
    spectators;
    bet_amount;
    house_edge;
    public;
    player_limit;
    status;
    created_at;
    finished_at;
    winner;
    winner_reason;
    turn_start_time;
    source;
    tournament_id;
    tournament_match_id;
    turn_timer_seconds;
};
exports.Room = Room;
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Room.prototype, "name", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, unique: true }),
    __metadata("design:type", String)
], Room.prototype, "code", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'Game', required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], Room.prototype, "game_id", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [RoomPlayer], default: [] }),
    __metadata("design:type", Array)
], Room.prototype, "players", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [{ type: mongoose_2.Types.ObjectId, ref: 'User' }], default: [] }),
    __metadata("design:type", Array)
], Room.prototype, "spectators", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, min: 0 }),
    __metadata("design:type", Number)
], Room.prototype, "bet_amount", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, min: 0, max: 100 }),
    __metadata("design:type", Number)
], Room.prototype, "house_edge", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Boolean)
], Room.prototype, "public", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Number)
], Room.prototype, "player_limit", void 0);
__decorate([
    (0, mongoose_1.Prop)({
        type: String,
        enum: Object.values(RoomStatus),
        default: RoomStatus.WAITING,
        lowercase: true,
    }),
    __metadata("design:type", String)
], Room.prototype, "status", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: Date.now }),
    __metadata("design:type", Date)
], Room.prototype, "created_at", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], Room.prototype, "finished_at", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User' }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], Room.prototype, "winner", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], Room.prototype, "winner_reason", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", Date)
], Room.prototype, "turn_start_time", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: String, enum: ['casual', 'tournament'], default: 'casual' }),
    __metadata("design:type", String)
], Room.prototype, "source", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'Tournament' }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], Room.prototype, "tournament_id", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], Room.prototype, "tournament_match_id", void 0);
__decorate([
    (0, mongoose_1.Prop)({ min: 1 }),
    __metadata("design:type", Number)
], Room.prototype, "turn_timer_seconds", void 0);
exports.Room = Room = __decorate([
    (0, mongoose_1.Schema)({ versionKey: false, timestamps: false })
], Room);
exports.RoomSchema = mongoose_1.SchemaFactory.createForClass(Room);
exports.RoomSchema.index({ game_id: 1 });
exports.RoomSchema.index({ status: 1 });
exports.RoomSchema.index({ winner: 1 });
exports.RoomSchema.index({ 'players.playerId': 1 });
exports.RoomSchema.index({ 'players.playerId': 1, game_id: 1 });
exports.RoomSchema.index({ 'players.playerId': 1 }, {
    unique: true,
    partialFilterExpression: { status: { $in: [RoomStatus.WAITING, RoomStatus.STARTED] } },
    name: 'players_playerId_active_unique',
});
//# sourceMappingURL=room.schema.js.map