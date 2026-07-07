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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TournamentAdminService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const crypto_1 = require("crypto");
const tournament_schema_1 = require("../schemas/tournament.schema");
const tournament_constants_1 = require("../constants/tournament.constants");
const game_schema_1 = require("../../game/schemas/game.schema");
const tournament_language_util_1 = require("../tournament-language.util");
const tournament_layout_util_1 = require("../tournament-layout.util");
let TournamentAdminService = class TournamentAdminService {
    tournamentModel;
    gameModel;
    constructor(tournamentModel, gameModel) {
        this.tournamentModel = tournamentModel;
        this.gameModel = gameModel;
    }
    validatePercents(house, first, second) {
        if (house + first + second !== 100) {
            throw new common_1.BadRequestException('Prize percents must sum to 100');
        }
    }
    async resolveGame(gameId) {
        const game = await this.gameModel.findById(gameId);
        if (!game)
            throw new common_1.NotFoundException('Game not found');
        if (!tournament_constants_1.TOURNAMENT_SUPPORTED_SOCKET_CODES.includes(game.socket_code)) {
            throw new common_1.BadRequestException(`Game ${game.socket_code} is not supported for tournaments`);
        }
        return game;
    }
    async findAll() {
        return this.tournamentModel.find().sort({ starts_at: -1 }).exec();
    }
    async findById(id) {
        const t = await this.tournamentModel.findById(id);
        if (!t)
            throw new common_1.NotFoundException('Tournament not found');
        return t;
    }
    async create(dto) {
        const layout = (0, tournament_layout_util_1.resolveTournamentLayout)(dto.maxPlayers, dto.minPlayers, dto.groupSize, dto.groupCount);
        const house = dto.houseFeePercent ?? 10;
        const first = dto.firstPlacePercent ?? 70;
        const second = dto.secondPlacePercent ?? 20;
        this.validatePercents(house, first, second);
        const game = await this.resolveGame(dto.gameId);
        const startsAt = new Date(dto.startsAt);
        return this.tournamentModel.create({
            title: (0, tournament_language_util_1.normalizeLanguageField)(dto.title, 'TITLE'),
            description: (0, tournament_language_util_1.normalizeOptionalLanguageField)(dto.description),
            game_id: game._id,
            game_socket_code: game.socket_code,
            status: tournament_constants_1.TournamentStatus.DRAFT,
            buy_in: dto.buyIn,
            max_players: layout.maxPlayers,
            min_players: layout.minPlayers,
            group_count: layout.groupCount,
            group_size: layout.groupSize,
            starts_at: startsAt,
            registration_opens_at: dto.registrationOpensAt ? new Date(dto.registrationOpensAt) : undefined,
            registration_closes_at: dto.registrationClosesAt
                ? new Date(dto.registrationClosesAt)
                : startsAt,
            turn_timer_seconds: dto.turnTimerSeconds ?? 30,
            between_rounds_pause_seconds: dto.betweenRoundsPauseSeconds ?? 300,
            presence_window_seconds: dto.presenceWindowSeconds ?? 90,
            rematch_delay_seconds: dto.rematchDelaySeconds ?? 60,
            house_fee_percent: house,
            first_place_percent: first,
            second_place_percent: second,
            bracket_seed: dto.bracketSeed?.trim() || (0, crypto_1.randomUUID)(),
        });
    }
    async update(id, dto) {
        const t = await this.findById(id);
        if (t.status !== tournament_constants_1.TournamentStatus.DRAFT) {
            throw new common_1.BadRequestException('Only draft tournaments can be edited');
        }
        const nextMax = dto.maxPlayers ?? t.max_players;
        const nextMin = dto.minPlayers ?? t.min_players;
        if (dto.maxPlayers != null ||
            dto.minPlayers != null ||
            dto.groupCount != null ||
            dto.groupSize != null) {
            const layout = (0, tournament_layout_util_1.resolveTournamentLayout)(nextMax, nextMin, dto.groupSize ?? t.group_size, dto.groupCount ?? t.group_count);
            t.max_players = layout.maxPlayers;
            t.min_players = layout.minPlayers;
            t.group_count = layout.groupCount;
            t.group_size = layout.groupSize;
        }
        if (dto.houseFeePercent != null || dto.firstPlacePercent != null || dto.secondPlacePercent != null) {
            this.validatePercents(dto.houseFeePercent ?? t.house_fee_percent, dto.firstPlacePercent ?? t.first_place_percent, dto.secondPlacePercent ?? t.second_place_percent);
        }
        if (dto.gameId) {
            const game = await this.resolveGame(dto.gameId);
            t.game_id = game._id;
            t.game_socket_code = game.socket_code;
        }
        if (dto.title != null)
            t.title = (0, tournament_language_util_1.normalizeLanguageField)(dto.title, 'TITLE');
        if (dto.description != null)
            t.description = (0, tournament_language_util_1.normalizeOptionalLanguageField)(dto.description);
        if (dto.buyIn != null)
            t.buy_in = dto.buyIn;
        if (dto.startsAt != null)
            t.starts_at = new Date(dto.startsAt);
        if (dto.registrationOpensAt != null)
            t.registration_opens_at = new Date(dto.registrationOpensAt);
        if (dto.registrationClosesAt != null)
            t.registration_closes_at = new Date(dto.registrationClosesAt);
        if (dto.turnTimerSeconds != null)
            t.turn_timer_seconds = dto.turnTimerSeconds;
        if (dto.betweenRoundsPauseSeconds != null) {
            t.between_rounds_pause_seconds = dto.betweenRoundsPauseSeconds;
        }
        if (dto.presenceWindowSeconds != null)
            t.presence_window_seconds = dto.presenceWindowSeconds;
        if (dto.rematchDelaySeconds != null)
            t.rematch_delay_seconds = dto.rematchDelaySeconds;
        if (dto.houseFeePercent != null)
            t.house_fee_percent = dto.houseFeePercent;
        if (dto.firstPlacePercent != null)
            t.first_place_percent = dto.firstPlacePercent;
        if (dto.secondPlacePercent != null)
            t.second_place_percent = dto.secondPlacePercent;
        if (dto.bracketSeed != null)
            t.bracket_seed = dto.bracketSeed.trim();
        await t.save();
        return t;
    }
    async open(id) {
        const t = await this.findById(id);
        if (t.status !== tournament_constants_1.TournamentStatus.DRAFT) {
            throw new common_1.BadRequestException('Only draft tournaments can be opened');
        }
        if (t.starts_at.getTime() <= Date.now()) {
            throw new common_1.BadRequestException('startsAt must be in the future');
        }
        this.validatePercents(t.house_fee_percent, t.first_place_percent, t.second_place_percent);
        (0, tournament_layout_util_1.resolveTournamentLayout)(t.max_players, t.min_players, t.group_size, t.group_count);
        t.status = tournament_constants_1.TournamentStatus.OPEN;
        if (!t.registration_opens_at)
            t.registration_opens_at = new Date();
        if (!t.registration_closes_at)
            t.registration_closes_at = t.starts_at;
        await t.save();
        return t;
    }
    async cancel(id) {
        const t = await this.findById(id);
        if (t.status === tournament_constants_1.TournamentStatus.FINISHED || t.status === tournament_constants_1.TournamentStatus.CANCELLED) {
            throw new common_1.BadRequestException('Tournament already terminal');
        }
        t.status = tournament_constants_1.TournamentStatus.CANCELLED;
        await t.save();
        return t;
    }
};
exports.TournamentAdminService = TournamentAdminService;
exports.TournamentAdminService = TournamentAdminService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(tournament_schema_1.Tournament.name)),
    __param(1, (0, mongoose_1.InjectModel)(game_schema_1.Game.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model])
], TournamentAdminService);
//# sourceMappingURL=tournament-admin.service.js.map