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
exports.GameSchema = exports.Game = exports.LanguageFieldSchema = exports.LanguageField = void 0;
const mongoose_1 = require("@nestjs/mongoose");
let LanguageField = class LanguageField {
    es;
    en;
    fr;
    de;
    it;
    pt;
};
exports.LanguageField = LanguageField;
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], LanguageField.prototype, "es", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], LanguageField.prototype, "en", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], LanguageField.prototype, "fr", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], LanguageField.prototype, "de", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], LanguageField.prototype, "it", void 0);
__decorate([
    (0, mongoose_1.Prop)(),
    __metadata("design:type", String)
], LanguageField.prototype, "pt", void 0);
exports.LanguageField = LanguageField = __decorate([
    (0, mongoose_1.Schema)({ _id: false })
], LanguageField);
exports.LanguageFieldSchema = mongoose_1.SchemaFactory.createForClass(LanguageField);
let Game = class Game {
    name;
    description;
    rules;
    active;
    min_players;
    max_players;
    min_bet;
    default_bets;
    house_edge;
    socket_code;
    turn_timer_seconds;
    uno_match_target;
    created_at;
};
exports.Game = Game;
__decorate([
    (0, mongoose_1.Prop)({ type: exports.LanguageFieldSchema, _id: false }),
    __metadata("design:type", LanguageField)
], Game.prototype, "name", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: exports.LanguageFieldSchema, _id: false }),
    __metadata("design:type", LanguageField)
], Game.prototype, "description", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [exports.LanguageFieldSchema], default: [] }),
    __metadata("design:type", Array)
], Game.prototype, "rules", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Boolean)
], Game.prototype, "active", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Number)
], Game.prototype, "min_players", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Number)
], Game.prototype, "max_players", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Number)
], Game.prototype, "min_bet", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: [Number], required: true }),
    __metadata("design:type", Array)
], Game.prototype, "default_bets", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, min: 1, max: 100 }),
    __metadata("design:type", Number)
], Game.prototype, "house_edge", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", String)
], Game.prototype, "socket_code", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, min: 1 }),
    __metadata("design:type", Number)
], Game.prototype, "turn_timer_seconds", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: false, min: 50, max: 500 }),
    __metadata("design:type", Number)
], Game.prototype, "uno_match_target", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: Date.now }),
    __metadata("design:type", Date)
], Game.prototype, "created_at", void 0);
exports.Game = Game = __decorate([
    (0, mongoose_1.Schema)()
], Game);
exports.GameSchema = mongoose_1.SchemaFactory.createForClass(Game);
//# sourceMappingURL=game.schema.js.map