"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.winnerGrossPayout = winnerGrossPayout;
exports.winnerDisplayedPrize = winnerDisplayedPrize;
function winnerGrossPayout(betAmount, houseEdgePercent, playerCount) {
    if (playerCount < 1 || betAmount <= 0)
        return 0;
    return betAmount * playerCount * (1 - houseEdgePercent / 100);
}
function winnerDisplayedPrize(betAmount, houseEdgePercent, playerCount) {
    const opponents = Math.max(0, playerCount - 1);
    if (opponents < 1 || betAmount <= 0)
        return 0;
    return betAmount * opponents * (1 - houseEdgePercent / 100);
}
//# sourceMappingURL=game-prize.util.js.map