"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveTurnTimerSeconds = resolveTurnTimerSeconds;
function resolveTurnTimerSeconds(room, game) {
    return room.turn_timer_seconds ?? game.turn_timer_seconds ?? 30;
}
//# sourceMappingURL=turn-timer.util.js.map