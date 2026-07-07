"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GAME_LANGS = void 0;
exports.normalizeLanguageField = normalizeLanguageField;
exports.normalizeRulesField = normalizeRulesField;
exports.toAdminGameRecord = toAdminGameRecord;
const business_exception_1 = require("../../common/exceptions/business.exception");
exports.GAME_LANGS = ['es', 'en', 'fr', 'de', 'it', 'pt'];
function normalizeLanguageField(value, fieldLabel) {
    if (value == null || value === '') {
        throw new business_exception_1.BusinessException(`ERROR_GAME_${fieldLabel}_REQUIRED`, 400);
    }
    let partial = {};
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
            throw new business_exception_1.BusinessException(`ERROR_GAME_${fieldLabel}_REQUIRED`, 400);
        }
        partial = { en: trimmed, es: trimmed };
    }
    else if (typeof value === 'object' && !Array.isArray(value)) {
        for (const lang of exports.GAME_LANGS) {
            const raw = value[lang];
            if (typeof raw === 'string' && raw.trim()) {
                partial[lang] = raw.trim();
            }
        }
    }
    else {
        throw new business_exception_1.BusinessException(`ERROR_GAME_${fieldLabel}_INVALID`, 400);
    }
    const fallback = partial.en || partial.es;
    if (!fallback) {
        throw new business_exception_1.BusinessException(`ERROR_GAME_${fieldLabel}_REQUIRED`, 400);
    }
    return {
        en: partial.en ?? fallback,
        es: partial.es ?? fallback,
        fr: partial.fr ?? fallback,
        de: partial.de ?? fallback,
        it: partial.it ?? fallback,
        pt: partial.pt ?? fallback,
    };
}
function normalizeRulesField(value) {
    if (value == null)
        return [];
    if (!Array.isArray(value)) {
        throw new business_exception_1.BusinessException('ERROR_GAME_RULES_INVALID', 400);
    }
    return value.map((rule, index) => normalizeLanguageField(rule, `RULE_${index + 1}`));
}
function toAdminGameRecord(game, activeRooms) {
    const id = game._id?.toString?.() ?? game.id;
    return {
        id,
        _id: game._id ?? id,
        name: game.name ?? {},
        description: game.description ?? {},
        rules: Array.isArray(game.rules) ? game.rules : [],
        active: game.active,
        min_players: game.min_players,
        max_players: game.max_players,
        min_bet: game.min_bet,
        default_bets: game.default_bets ?? [],
        house_edge: game.house_edge,
        houseEdge: game.house_edge,
        socket_code: game.socket_code,
        turn_timer_seconds: game.turn_timer_seconds,
        uno_match_target: game.uno_match_target,
        unoMatchTarget: game.uno_match_target,
        ...(activeRooms !== undefined ? { activeRooms } : {}),
    };
}
//# sourceMappingURL=game-language.util.js.map