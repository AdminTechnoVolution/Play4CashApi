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
exports.BattleshipPlacementSchema = exports.BattleshipPlacement = exports.ShipSchema = exports.Ship = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
let Ship = class Ship {
    type;
    startRow;
    startCol;
    isHorizontal;
    cells;
};
exports.Ship = Ship;
__decorate([
    (0, mongoose_1.Prop)({ required: true, enum: ['carrier', 'battleship', 'cruiser', 'submarine', 'destroyer'] }),
    __metadata("design:type", String)
], Ship.prototype, "type", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, min: 0, max: 9 }),
    __metadata("design:type", Number)
], Ship.prototype, "startRow", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, min: 0, max: 9 }),
    __metadata("design:type", Number)
], Ship.prototype, "startCol", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Boolean)
], Ship.prototype, "isHorizontal", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [[Number]], required: true }),
    __metadata("design:type", Array)
], Ship.prototype, "cells", void 0);
exports.Ship = Ship = __decorate([
    (0, mongoose_1.Schema)({ _id: false })
], Ship);
exports.ShipSchema = mongoose_1.SchemaFactory.createForClass(Ship);
let BattleshipPlacement = class BattleshipPlacement {
    room_id;
    player_id;
    ships;
    shotsFired;
    ready_at;
    status;
};
exports.BattleshipPlacement = BattleshipPlacement;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Schema.Types.ObjectId, ref: 'Room', required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], BattleshipPlacement.prototype, "room_id", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Schema.Types.ObjectId, ref: 'User', required: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], BattleshipPlacement.prototype, "player_id", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [exports.ShipSchema], required: true }),
    __metadata("design:type", Array)
], BattleshipPlacement.prototype, "ships", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [[Number]], default: [] }),
    __metadata("design:type", Array)
], BattleshipPlacement.prototype, "shotsFired", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Date, default: Date.now }),
    __metadata("design:type", Date)
], BattleshipPlacement.prototype, "ready_at", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: String, enum: ['placed', 'ready'], default: 'placed' }),
    __metadata("design:type", String)
], BattleshipPlacement.prototype, "status", void 0);
exports.BattleshipPlacement = BattleshipPlacement = __decorate([
    (0, mongoose_1.Schema)({ versionKey: false, timestamps: true })
], BattleshipPlacement);
exports.BattleshipPlacementSchema = mongoose_1.SchemaFactory.createForClass(BattleshipPlacement);
exports.BattleshipPlacementSchema.index({ room_id: 1, player_id: 1 }, { unique: true });
//# sourceMappingURL=battleship-placement.schema.js.map