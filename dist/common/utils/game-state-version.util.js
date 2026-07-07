"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bumpGameStateVersion = bumpGameStateVersion;
exports.computeTurnDeadlineAt = computeTurnDeadlineAt;
exports.enrichGamePayload = enrichGamePayload;
async function bumpGameStateVersion(redis, game, roomId) {
    const key = `gameStateVersion:${game}:${roomId}`;
    const v = await redis.incr(key);
    await redis.expire(key, 86_400);
    return Number(v);
}
function computeTurnDeadlineAt(turnStart, timerSeconds) {
    if (!turnStart || !timerSeconds || timerSeconds <= 0)
        return null;
    const t = turnStart instanceof Date ? turnStart.getTime() : Date.parse(String(turnStart));
    if (!Number.isFinite(t))
        return null;
    return new Date(t + timerSeconds * 1000).toISOString();
}
async function enrichGamePayload(redis, game, roomId, data, opts) {
    const stateVersion = await bumpGameStateVersion(redis, game, roomId);
    const turnDeadlineAt = computeTurnDeadlineAt(opts?.turnStart ?? null, opts?.timerSeconds ?? 0);
    return {
        ...data,
        stateVersion,
        ...(turnDeadlineAt ? { turnDeadlineAt } : {}),
    };
}
//# sourceMappingURL=game-state-version.util.js.map