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
exports.TournamentParticipantSchema = exports.TournamentParticipant = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const tournament_constants_1 = require("../constants/tournament.constants");
let TournamentParticipant = class TournamentParticipant {
    tournament_id;
    user_id;
    username;
    status;
    seed;
    group_number;
    registered_at;
    eliminated_at;
    final_rank;
};
exports.TournamentParticipant = TournamentParticipant;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'Tournament', required: true, index: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], TournamentParticipant.prototype, "tournament_id", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User', required: true, index: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], TournamentParticipant.prototype, "user_id", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true, trim: true }),
    __metadata("design:type", String)
], TournamentParticipant.prototype, "username", void 0);
__decorate([
    (0, mongoose_1.Prop)({
        type: String,
        enum: Object.values(tournament_constants_1.TournamentParticipantStatus),
        default: tournament_constants_1.TournamentParticipantStatus.REGISTERED,
    }),
    __metadata("design:type", String)
], TournamentParticipant.prototype, "status", void 0);
__decorate([
    (0, mongoose_1.Prop)({ min: 1 }),
    __metadata("design:type", Number)
], TournamentParticipant.prototype, "seed", void 0);
__decorate([
    (0, mongoose_1.Prop)({ min: 1, max: 500 }),
    __metadata("design:type", Number)
], TournamentParticipant.prototype, "group_number", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Date, required: true }),
    __metadata("design:type", Date)
], TournamentParticipant.prototype, "registered_at", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: Date }),
    __metadata("design:type", Date)
], TournamentParticipant.prototype, "eliminated_at", void 0);
__decorate([
    (0, mongoose_1.Prop)({ min: 1, max: 50 }),
    __metadata("design:type", Number)
], TournamentParticipant.prototype, "final_rank", void 0);
exports.TournamentParticipant = TournamentParticipant = __decorate([
    (0, mongoose_1.Schema)({ versionKey: false, timestamps: true })
], TournamentParticipant);
exports.TournamentParticipantSchema = mongoose_1.SchemaFactory.createForClass(TournamentParticipant);
exports.TournamentParticipantSchema.index({ tournament_id: 1, user_id: 1 }, { unique: true });
exports.TournamentParticipantSchema.index({ tournament_id: 1, seed: 1 });
//# sourceMappingURL=tournament-participant.schema.js.map