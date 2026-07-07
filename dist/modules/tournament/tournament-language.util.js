"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GAME_LANGS = exports.normalizeLanguageField = void 0;
exports.normalizeOptionalLanguageField = normalizeOptionalLanguageField;
exports.resolveRequestLang = resolveRequestLang;
exports.resolveWsLang = resolveWsLang;
exports.pickLocalizedField = pickLocalizedField;
exports.toAdminLanguageField = toAdminLanguageField;
exports.toAdminTournamentRecord = toAdminTournamentRecord;
const game_language_util_1 = require("../game/game-language.util");
Object.defineProperty(exports, "GAME_LANGS", { enumerable: true, get: function () { return game_language_util_1.GAME_LANGS; } });
Object.defineProperty(exports, "normalizeLanguageField", { enumerable: true, get: function () { return game_language_util_1.normalizeLanguageField; } });
const SUPPORTED = new Set(game_language_util_1.GAME_LANGS);
function normalizeOptionalLanguageField(value) {
    if (value == null || value === '') {
        return { en: '', es: '', fr: '', de: '', it: '', pt: '' };
    }
    return (0, game_language_util_1.normalizeLanguageField)(value, 'DESCRIPTION');
}
function resolveRequestLang(langHeader) {
    const raw = (langHeader ?? 'en').split(',')[0]?.trim().toLowerCase().slice(0, 2);
    return SUPPORTED.has(raw) ? raw : 'en';
}
function resolveWsLang(client) {
    const queryLang = client.handshake?.query?.lang;
    if (queryLang && SUPPORTED.has(queryLang.toLowerCase())) {
        return queryLang.toLowerCase();
    }
    const authLang = client.handshake?.auth?.lang;
    if (authLang && SUPPORTED.has(authLang.toLowerCase())) {
        return authLang.toLowerCase();
    }
    if (client.data?.lang && SUPPORTED.has(client.data.lang)) {
        return client.data.lang;
    }
    const headerLang = client.handshake.headers['accept-language'];
    if (headerLang) {
        const tag = headerLang.split(',')[0]?.trim().toLowerCase().slice(0, 2);
        if (tag && SUPPORTED.has(tag))
            return tag;
    }
    return 'en';
}
function pickLocalizedField(field, lang) {
    if (typeof field === 'string')
        return field;
    if (!field || typeof field !== 'object')
        return '';
    const l = SUPPORTED.has(lang) ? lang : 'en';
    const lf = field;
    return lf[l] ?? lf.en ?? lf.es ?? '';
}
function toAdminLanguageField(field, fieldLabel) {
    if (field == null || field === '') {
        return { en: '', es: '', fr: '', de: '', it: '', pt: '' };
    }
    if (typeof field === 'string') {
        return (0, game_language_util_1.normalizeLanguageField)(field, fieldLabel);
    }
    return {
        en: field.en ?? '',
        es: field.es ?? '',
        fr: field.fr ?? '',
        de: field.de ?? '',
        it: field.it ?? '',
        pt: field.pt ?? '',
    };
}
function toAdminTournamentRecord(t) {
    return {
        id: t._id.toString(),
        title: toAdminLanguageField(t.title, 'TITLE'),
        description: toAdminLanguageField(t.description, 'DESCRIPTION'),
        gameId: t.game_id.toString(),
        gameSocketCode: t.game_socket_code,
        status: t.status,
        buyIn: t.buy_in,
        maxPlayers: t.max_players,
        minPlayers: t.min_players,
        groupCount: t.group_count,
        groupSize: t.group_size,
        registeredCount: t.registered_count,
        startsAt: t.starts_at.toISOString(),
        registrationOpensAt: t.registration_opens_at?.toISOString() ?? null,
        registrationClosesAt: t.registration_closes_at?.toISOString() ?? null,
        turnTimerSeconds: t.turn_timer_seconds,
        betweenRoundsPauseSeconds: t.between_rounds_pause_seconds,
        presenceWindowSeconds: t.presence_window_seconds,
        rematchDelaySeconds: t.rematch_delay_seconds,
        houseFeePercent: t.house_fee_percent,
        firstPlacePercent: t.first_place_percent,
        secondPlacePercent: t.second_place_percent,
        grossPrizePool: t.gross_prize_pool,
        houseAmount: t.house_amount,
        firstPlaceAmount: t.first_place_amount,
        secondPlaceAmount: t.second_place_amount,
        winnerUserId: t.winner_user_id?.toString() ?? null,
        runnerUpUserId: t.runner_up_user_id?.toString() ?? null,
        bracketSeed: t.bracket_seed ?? null,
        currentPhase: t.current_phase,
        currentRoundIndex: t.current_round_index,
        betweenRoundsEndsAt: t.between_rounds_ends_at?.toISOString() ?? null,
        presenceWindowEndsAt: t.presence_window_ends_at?.toISOString() ?? null,
        prizesSettled: t.prizes_settled,
        finishedAt: t.finished_at?.toISOString() ?? null,
    };
}
//# sourceMappingURL=tournament-language.util.js.map