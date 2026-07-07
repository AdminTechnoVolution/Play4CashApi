"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UNO_ALLOWED_PLAYER_COUNTS = exports.UNO_MATCH_TARGET_DEFAULT = exports.UNO_MATCH_TARGET_MAX = exports.UNO_MATCH_TARGET_MIN = exports.UNO_SOCKET_CODE = void 0;
exports.isValidUnoPlayerCount = isValidUnoPlayerCount;
exports.clampUnoMatchTarget = clampUnoMatchTarget;
exports.resolveUnoMatchTarget = resolveUnoMatchTarget;
exports.UNO_SOCKET_CODE = 'uno';
exports.UNO_MATCH_TARGET_MIN = 50;
exports.UNO_MATCH_TARGET_MAX = 500;
exports.UNO_MATCH_TARGET_DEFAULT = 200;
exports.UNO_ALLOWED_PLAYER_COUNTS = [2, 4, 6, 8, 10];
function isValidUnoPlayerCount(n) {
    return exports.UNO_ALLOWED_PLAYER_COUNTS.includes(n);
}
function clampUnoMatchTarget(n) {
    return Math.max(exports.UNO_MATCH_TARGET_MIN, Math.min(exports.UNO_MATCH_TARGET_MAX, n));
}
function resolveUnoMatchTarget(catalogTarget, envRaw) {
    const fromDb = typeof catalogTarget === 'number' && Number.isFinite(catalogTarget) ? catalogTarget : null;
    const parsedEnv = Number(envRaw);
    const base = fromDb ??
        (Number.isFinite(parsedEnv) && parsedEnv > 0 ? parsedEnv : exports.UNO_MATCH_TARGET_DEFAULT);
    return clampUnoMatchTarget(base);
}
//# sourceMappingURL=uno-game.constants.js.map