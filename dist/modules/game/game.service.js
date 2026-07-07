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
var GameService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const game_schema_1 = require("./schemas/game.schema");
const room_schema_1 = require("../room/schemas/room.schema");
const business_exception_1 = require("../../common/exceptions/business.exception");
const connect_four_game_constants_1 = require("../../common/constants/connect-four-game.constants");
const uno_game_constants_1 = require("../../common/constants/uno-game.constants");
const game_catalog_rules_1 = require("./game-catalog-rules");
const game_language_util_1 = require("./game-language.util");
let GameService = GameService_1 = class GameService {
    gameModel;
    roomModel;
    logger = new common_1.Logger(GameService_1.name);
    constructor(gameModel, roomModel) {
        this.gameModel = gameModel;
        this.roomModel = roomModel;
    }
    async onModuleInit() {
        await this.ensureUnoCatalogEntry();
        await this.ensureConnectFourCatalogEntry();
        await this.ensureCatalogRules();
    }
    async ensureConnectFourCatalogEntry() {
        const exists = await this.gameModel.findOne({ socket_code: connect_four_game_constants_1.CONNECT_FOUR_SOCKET_CODE }).lean();
        if (exists)
            return;
        const localized = (en, es, fr, de, it, pt) => ({
            en,
            es,
            fr: fr ?? en,
            de: de ?? en,
            it: it ?? en,
            pt: pt ?? en,
        });
        await this.gameModel.create({
            name: localized('Connect Four', '4 en raya', 'Puissance 4', 'Vier gewinnt', 'Forza 4', 'Lig 4'),
            description: localized('Drop discs to connect four in a row — horizontal, vertical, or diagonal.', 'Conecta cuatro fichas en línea — horizontal, vertical o diagonal.', 'Alignez quatre pions pour gagner.', 'Verbinde vier Spielsteine in einer Reihe.', 'Allinea quattro pedine in fila.', 'Alinhe quatro fichas em linha.'),
            active: true,
            min_players: 2,
            max_players: 2,
            min_bet: 5,
            default_bets: [5, 10, 25, 50, 100],
            house_edge: 5,
            socket_code: connect_four_game_constants_1.CONNECT_FOUR_SOCKET_CODE,
            turn_timer_seconds: 30,
            rules: game_catalog_rules_1.GAME_CATALOG_RULES[connect_four_game_constants_1.CONNECT_FOUR_SOCKET_CODE] ?? [],
        });
        this.logger.log(`Catalog: inserted game "${connect_four_game_constants_1.CONNECT_FOUR_SOCKET_CODE}" (2 players, 6×7).`);
    }
    async ensureUnoCatalogEntry() {
        const exists = await this.gameModel.findOne({ socket_code: uno_game_constants_1.UNO_SOCKET_CODE }).lean();
        if (exists) {
            await this.gameModel.updateMany({ socket_code: uno_game_constants_1.UNO_SOCKET_CODE, uno_match_target: { $exists: false } }, { $set: { uno_match_target: uno_game_constants_1.UNO_MATCH_TARGET_DEFAULT } });
            return;
        }
        const localized = (en, es) => ({
            en,
            es,
            fr: en,
            de: en,
            it: en,
            pt: en,
        });
        await this.gameModel.create({
            name: localized('UNO', 'UNO'),
            description: localized('Classic card game for 2–10 players (even counts). Match color or number, use action cards, and empty your hand to win the round.', 'Juego de cartas clásico para 2–10 jugadores (cantidades pares). Iguala color o número, usa cartas de acción y quédate sin cartas para ganar la ronda.'),
            active: true,
            min_players: 2,
            max_players: 10,
            min_bet: 5,
            default_bets: [5, 10, 25, 50, 100],
            house_edge: 5,
            socket_code: uno_game_constants_1.UNO_SOCKET_CODE,
            turn_timer_seconds: 45,
            uno_match_target: uno_game_constants_1.UNO_MATCH_TARGET_DEFAULT,
            rules: game_catalog_rules_1.GAME_CATALOG_RULES[uno_game_constants_1.UNO_SOCKET_CODE] ?? [],
        });
        this.logger.log(`Catalog: inserted game "${uno_game_constants_1.UNO_SOCKET_CODE}" (min_players=2, max_players=10).`);
    }
    async ensureCatalogRules() {
        for (const [socketCode, rules] of Object.entries(game_catalog_rules_1.GAME_CATALOG_RULES)) {
            if (!rules.length)
                continue;
            const result = await this.gameModel.updateMany({ socket_code: socketCode }, { $set: { rules } });
            if (result.matchedCount > 0) {
                this.logger.log(`Catalog: synced ${result.modifiedCount}/${result.matchedCount} rule set(s) for "${socketCode}".`);
            }
        }
    }
    async findAll(lang = 'en') {
        const [data, activeRoomCounts] = await Promise.all([
            this.gameModel.find({ active: true }).select('-created_at').lean(),
            this.aggregateActiveRoomCounts(),
        ]);
        const countMap = activeRoomCounts;
        const games = this.localizeGames(data, lang);
        return games.map((g) => ({
            ...g,
            houseEdge: g.house_edge,
            unoMatchTarget: g.uno_match_target,
            activeRooms: countMap.get(g._id.toString()) ?? 0,
        }));
    }
    async findAllAdmin() {
        const [data, countMap] = await Promise.all([
            this.gameModel.find().select('-created_at').sort({ socket_code: 1 }).lean(),
            this.aggregateActiveRoomCounts(),
        ]);
        return data.map((g) => (0, game_language_util_1.toAdminGameRecord)(g, countMap.get(String(g._id)) ?? 0));
    }
    async findById(id, lang = 'en') {
        const game = await this.gameModel.findById(id).select('-created_at').lean();
        if (!game)
            throw new business_exception_1.BusinessException('ERROR_GAME_NOT_FOUND', 404);
        const g = this.localizeGames([game], lang)[0];
        return { ...g, houseEdge: g.house_edge, unoMatchTarget: g.uno_match_target };
    }
    async findByIdAdmin(id) {
        const game = await this.gameModel.findById(id).select('-created_at').lean();
        if (!game)
            throw new business_exception_1.BusinessException('ERROR_GAME_NOT_FOUND', 404);
        const counts = await this.aggregateActiveRoomCounts();
        return (0, game_language_util_1.toAdminGameRecord)(game, counts.get(String(game._id)) ?? 0);
    }
    async create(dto) {
        const payload = this.toCreatePayload(dto);
        const created = await this.gameModel.create(payload);
        return (0, game_language_util_1.toAdminGameRecord)(created.toObject(), 0);
    }
    async update(id, dto) {
        const patch = this.toUpdatePayload(dto);
        if (Object.keys(patch).length === 0) {
            return this.findByIdAdmin(id);
        }
        const game = await this.gameModel
            .findByIdAndUpdate(id, { $set: patch }, { returnDocument: 'after' })
            .select('-created_at')
            .lean();
        if (!game)
            throw new business_exception_1.BusinessException('ERROR_GAME_NOT_FOUND', 404);
        const counts = await this.aggregateActiveRoomCounts();
        return (0, game_language_util_1.toAdminGameRecord)(game, counts.get(String(game._id)) ?? 0);
    }
    async remove(id) {
        const game = await this.gameModel.findByIdAndDelete(id);
        if (!game)
            throw new business_exception_1.BusinessException('ERROR_GAME_NOT_FOUND', 404);
    }
    async aggregateActiveRoomCounts() {
        const activeRoomCounts = await this.roomModel.aggregate([
            { $match: { status: { $ne: room_schema_1.RoomStatus.FINISHED } } },
            { $group: { _id: '$game_id', count: { $sum: 1 } } },
        ]);
        return new Map(activeRoomCounts.map((r) => [r._id.toString(), r.count]));
    }
    toCreatePayload(dto) {
        return {
            name: (0, game_language_util_1.normalizeLanguageField)(dto.name, 'NAME'),
            description: (0, game_language_util_1.normalizeLanguageField)(dto.description, 'DESCRIPTION'),
            rules: (0, game_language_util_1.normalizeRulesField)(dto.rules ?? []),
            active: dto.active,
            min_players: dto.min_players,
            max_players: dto.max_players,
            min_bet: dto.min_bet,
            default_bets: dto.default_bets,
            house_edge: dto.house_edge,
            socket_code: dto.socket_code,
            turn_timer_seconds: dto.turn_timer_seconds,
            ...(dto.uno_match_target !== undefined ? { uno_match_target: dto.uno_match_target } : {}),
        };
    }
    toUpdatePayload(dto) {
        const out = {};
        if (dto.name !== undefined)
            out.name = (0, game_language_util_1.normalizeLanguageField)(dto.name, 'NAME');
        if (dto.description !== undefined) {
            out.description = (0, game_language_util_1.normalizeLanguageField)(dto.description, 'DESCRIPTION');
        }
        if (dto.rules !== undefined)
            out.rules = (0, game_language_util_1.normalizeRulesField)(dto.rules);
        if (dto.active !== undefined)
            out.active = dto.active;
        if (dto.min_players !== undefined)
            out.min_players = dto.min_players;
        if (dto.max_players !== undefined)
            out.max_players = dto.max_players;
        if (dto.min_bet !== undefined)
            out.min_bet = dto.min_bet;
        if (dto.default_bets !== undefined)
            out.default_bets = dto.default_bets;
        if (dto.house_edge !== undefined)
            out.house_edge = dto.house_edge;
        if (dto.socket_code !== undefined)
            out.socket_code = dto.socket_code;
        if (dto.turn_timer_seconds !== undefined)
            out.turn_timer_seconds = dto.turn_timer_seconds;
        if (dto.uno_match_target !== undefined)
            out.uno_match_target = dto.uno_match_target;
        return out;
    }
    localizeGames(games, lang) {
        const supportedLangs = ['es', 'en', 'fr', 'de', 'it', 'pt'];
        const l = supportedLangs.includes(lang) ? lang : 'en';
        return games.map((game) => {
            const g = { ...game };
            if (g.name && typeof g.name === 'object') {
                g.name = g.name[l] ?? g.name.en ?? g.name.es ?? '';
            }
            if (g.description && typeof g.description === 'object') {
                g.description = g.description[l] ?? g.description.en ?? g.description.es ?? '';
            }
            if (Array.isArray(g.rules)) {
                g.rules = g.rules
                    .map((rule) => {
                    if (rule && typeof rule === 'object') {
                        return rule[l] ?? rule.en ?? rule.es ?? '';
                    }
                    return typeof rule === 'string' ? rule : '';
                })
                    .filter((text) => text.trim().length > 0);
            }
            else {
                g.rules = [];
            }
            return g;
        });
    }
};
exports.GameService = GameService;
exports.GameService = GameService = GameService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(game_schema_1.Game.name)),
    __param(1, (0, mongoose_1.InjectModel)(room_schema_1.Room.name)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model])
], GameService);
//# sourceMappingURL=game.service.js.map