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
exports.TournamentTransactionSchema = exports.TournamentTransaction = void 0;
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const tournament_constants_1 = require("../constants/tournament.constants");
let TournamentTransaction = class TournamentTransaction {
    tournament_id;
    user_id;
    type;
    amount;
    status;
    idempotency_key;
    reference;
};
exports.TournamentTransaction = TournamentTransaction;
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'Tournament', required: true, index: true }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], TournamentTransaction.prototype, "tournament_id", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: mongoose_2.Types.ObjectId, ref: 'User' }),
    __metadata("design:type", mongoose_2.Types.ObjectId)
], TournamentTransaction.prototype, "user_id", void 0);
__decorate([
    (0, mongoose_1.Prop)({ type: String, enum: Object.values(tournament_constants_1.TournamentTransactionType), required: true }),
    __metadata("design:type", String)
], TournamentTransaction.prototype, "type", void 0);
__decorate([
    (0, mongoose_1.Prop)({ required: true }),
    __metadata("design:type", Number)
], TournamentTransaction.prototype, "amount", void 0);
__decorate([
    (0, mongoose_1.Prop)({ default: 'completed' }),
    __metadata("design:type", String)
], TournamentTransaction.prototype, "status", void 0);
__decorate([
    (0, mongoose_1.Prop)({ trim: true, sparse: true, unique: true }),
    __metadata("design:type", String)
], TournamentTransaction.prototype, "idempotency_key", void 0);
__decorate([
    (0, mongoose_1.Prop)({ trim: true }),
    __metadata("design:type", String)
], TournamentTransaction.prototype, "reference", void 0);
exports.TournamentTransaction = TournamentTransaction = __decorate([
    (0, mongoose_1.Schema)({ versionKey: false, timestamps: true })
], TournamentTransaction);
exports.TournamentTransactionSchema = mongoose_1.SchemaFactory.createForClass(TournamentTransaction);
//# sourceMappingURL=tournament-transaction.schema.js.map