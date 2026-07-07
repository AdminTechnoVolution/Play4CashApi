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
exports.UpdateTournamentDto = exports.CreateTournamentDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
const tournament_constants_1 = require("../constants/tournament.constants");
const I18N_TITLE_EXAMPLE = {
    es: 'Torneo Connect Four',
    en: 'Connect Four Tournament',
    fr: 'Tournoi Connect Four',
    de: 'Connect Four Turnier',
    it: 'Torneo Connect Four',
    pt: 'Torneio Connect Four',
};
const I18N_DESC_EXAMPLE = {
    es: 'Compite por el premio mayor.',
    en: 'Compete for the top prize.',
    fr: 'Participez pour le grand prix.',
    de: 'Kämpfe um den Hauptpreis.',
    it: 'Competi per il primo premio.',
    pt: 'Compita pelo prêmio principal.',
};
class CreateTournamentDto {
    title;
    description;
    gameId;
    buyIn;
    maxPlayers = 8;
    minPlayers = 4;
    groupSize;
    groupCount;
    startsAt;
    registrationOpensAt;
    registrationClosesAt;
    turnTimerSeconds;
    betweenRoundsPauseSeconds;
    presenceWindowSeconds;
    rematchDelaySeconds;
    houseFeePercent;
    firstPlacePercent;
    secondPlacePercent;
    bracketSeed;
}
exports.CreateTournamentDto = CreateTournamentDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: I18N_TITLE_EXAMPLE }),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], CreateTournamentDto.prototype, "title", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: I18N_DESC_EXAMPLE }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], CreateTournamentDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateTournamentDto.prototype, "gameId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0.01),
    __metadata("design:type", Number)
], CreateTournamentDto.prototype, "buyIn", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ default: 8, description: 'Power of 2 (2, 4, 8, 16…) — players are grouped in pairs (groupSize 2)' }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(tournament_constants_1.TOURNAMENT_MIN_PLAYERS),
    (0, class_validator_1.Max)(tournament_constants_1.TOURNAMENT_MAX_PLAYERS),
    __metadata("design:type", Number)
], CreateTournamentDto.prototype, "maxPlayers", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ default: 4, description: 'Power of 2, at least 2, cannot exceed maxPlayers' }),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(tournament_constants_1.TOURNAMENT_MIN_PLAYERS),
    (0, class_validator_1.Max)(tournament_constants_1.TOURNAMENT_MAX_PLAYERS),
    __metadata("design:type", Number)
], CreateTournamentDto.prototype, "minPlayers", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        default: tournament_constants_1.TOURNAMENT_GROUP_SIZE,
        description: 'Must be 2 (pairs). groupCount is derived as maxPlayers / 2.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(tournament_constants_1.TOURNAMENT_GROUP_SIZE),
    (0, class_validator_1.Max)(tournament_constants_1.TOURNAMENT_GROUP_SIZE),
    __metadata("design:type", Number)
], CreateTournamentDto.prototype, "groupSize", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({
        description: 'Optional; defaults to maxPlayers / 2. Must match when provided.',
    }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(tournament_constants_1.TOURNAMENT_MAX_PLAYERS / tournament_constants_1.TOURNAMENT_GROUP_SIZE),
    __metadata("design:type", Number)
], CreateTournamentDto.prototype, "groupCount", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], CreateTournamentDto.prototype, "startsAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], CreateTournamentDto.prototype, "registrationOpensAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], CreateTournamentDto.prototype, "registrationClosesAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: 30 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(15),
    (0, class_validator_1.Max)(180),
    __metadata("design:type", Number)
], CreateTournamentDto.prototype, "turnTimerSeconds", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: 300 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(60),
    (0, class_validator_1.Max)(900),
    __metadata("design:type", Number)
], CreateTournamentDto.prototype, "betweenRoundsPauseSeconds", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: 90 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(30),
    (0, class_validator_1.Max)(180),
    __metadata("design:type", Number)
], CreateTournamentDto.prototype, "presenceWindowSeconds", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: 60 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(30),
    (0, class_validator_1.Max)(300),
    __metadata("design:type", Number)
], CreateTournamentDto.prototype, "rematchDelaySeconds", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: 10 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(100),
    __metadata("design:type", Number)
], CreateTournamentDto.prototype, "houseFeePercent", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: 70 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(100),
    __metadata("design:type", Number)
], CreateTournamentDto.prototype, "firstPlacePercent", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: 20 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(100),
    __metadata("design:type", Number)
], CreateTournamentDto.prototype, "secondPlacePercent", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateTournamentDto.prototype, "bracketSeed", void 0);
class UpdateTournamentDto {
    title;
    description;
    gameId;
    buyIn;
    maxPlayers;
    minPlayers;
    groupCount;
    groupSize;
    startsAt;
    registrationOpensAt;
    registrationClosesAt;
    turnTimerSeconds;
    betweenRoundsPauseSeconds;
    presenceWindowSeconds;
    rematchDelaySeconds;
    houseFeePercent;
    firstPlacePercent;
    secondPlacePercent;
    bracketSeed;
}
exports.UpdateTournamentDto = UpdateTournamentDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: I18N_TITLE_EXAMPLE }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], UpdateTournamentDto.prototype, "title", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: I18N_DESC_EXAMPLE }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], UpdateTournamentDto.prototype, "description", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateTournamentDto.prototype, "gameId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0.01),
    __metadata("design:type", Number)
], UpdateTournamentDto.prototype, "buyIn", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(tournament_constants_1.TOURNAMENT_MIN_PLAYERS),
    (0, class_validator_1.Max)(tournament_constants_1.TOURNAMENT_MAX_PLAYERS),
    __metadata("design:type", Number)
], UpdateTournamentDto.prototype, "maxPlayers", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(tournament_constants_1.TOURNAMENT_MIN_PLAYERS),
    (0, class_validator_1.Max)(tournament_constants_1.TOURNAMENT_MAX_PLAYERS),
    __metadata("design:type", Number)
], UpdateTournamentDto.prototype, "minPlayers", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(tournament_constants_1.TOURNAMENT_MAX_PLAYERS / tournament_constants_1.TOURNAMENT_GROUP_SIZE),
    __metadata("design:type", Number)
], UpdateTournamentDto.prototype, "groupCount", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(tournament_constants_1.TOURNAMENT_GROUP_SIZE),
    (0, class_validator_1.Max)(tournament_constants_1.TOURNAMENT_GROUP_SIZE),
    __metadata("design:type", Number)
], UpdateTournamentDto.prototype, "groupSize", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], UpdateTournamentDto.prototype, "startsAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], UpdateTournamentDto.prototype, "registrationOpensAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], UpdateTournamentDto.prototype, "registrationClosesAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(15),
    (0, class_validator_1.Max)(180),
    __metadata("design:type", Number)
], UpdateTournamentDto.prototype, "turnTimerSeconds", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(60),
    (0, class_validator_1.Max)(900),
    __metadata("design:type", Number)
], UpdateTournamentDto.prototype, "betweenRoundsPauseSeconds", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(30),
    (0, class_validator_1.Max)(180),
    __metadata("design:type", Number)
], UpdateTournamentDto.prototype, "presenceWindowSeconds", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(30),
    (0, class_validator_1.Max)(300),
    __metadata("design:type", Number)
], UpdateTournamentDto.prototype, "rematchDelaySeconds", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], UpdateTournamentDto.prototype, "houseFeePercent", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], UpdateTournamentDto.prototype, "firstPlacePercent", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], UpdateTournamentDto.prototype, "secondPlacePercent", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], UpdateTournamentDto.prototype, "bracketSeed", void 0);
//# sourceMappingURL=tournament.dto.js.map