"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDominoGameResult = exports.getNextActivePlayerIndex = exports.calculateHandScore = exports.validateMove = exports.hasValidMoves = exports.canPlayTile = exports.getStartingPlayerIndex = exports.deal = void 0;
const generateTiles = () => {
    const t = [];
    for (let i = 0; i <= 6; i++)
        for (let j = i; j <= 6; j++)
            t.push([i, j]);
    return t;
};
const deal = (playerIds) => {
    const all = generateTiles().sort(() => Math.random() - 0.5);
    const hands = new Map();
    playerIds.forEach(id => hands.set(id, all.splice(0, 7)));
    return { hands, boneyard: all };
};
exports.deal = deal;
const getStartingPlayerIndex = (playerIds, hands) => {
    let bestDouble = -1, idx = 0;
    playerIds.forEach((id, i) => {
        for (const [v1, v2] of hands.get(id) || []) {
            if (v1 === v2 && v1 > bestDouble) {
                bestDouble = v1;
                idx = i;
            }
        }
    });
    if (bestDouble !== -1)
        return idx;
    let maxSum = -1;
    playerIds.forEach((id, i) => { for (const [v1, v2] of hands.get(id) || [])
        if (v1 + v2 > maxSum) {
            maxSum = v1 + v2;
            idx = i;
        } });
    return idx;
};
exports.getStartingPlayerIndex = getStartingPlayerIndex;
const canPlayTile = (tile, openEnds) => {
    if (openEnds.left === undefined)
        return true;
    const [v1, v2] = tile;
    return v1 === openEnds.left || v2 === openEnds.left || v1 === openEnds.right || v2 === openEnds.right;
};
exports.canPlayTile = canPlayTile;
const hasValidMoves = (hand, openEnds) => hand.some(t => (0, exports.canPlayTile)(t, openEnds));
exports.hasValidMoves = hasValidMoves;
const validateMove = (tile, side, openEnds) => {
    if (openEnds.left === undefined)
        return { valid: true, flippedTile: tile, side: 'left' };
    const [v1, v2] = tile;
    let valid = false, flippedTile = [...tile];
    if (side === 'left') {
        if (v2 === openEnds.left)
            valid = true;
        else if (v1 === openEnds.left) {
            valid = true;
            flippedTile = [v2, v1];
        }
    }
    else {
        if (v1 === openEnds.right)
            valid = true;
        else if (v2 === openEnds.right) {
            valid = true;
            flippedTile = [v2, v1];
        }
    }
    return { valid, flippedTile, side };
};
exports.validateMove = validateMove;
const calculateHandScore = (hand) => hand.reduce((s, [v1, v2]) => s + v1 + v2, 0);
exports.calculateHandScore = calculateHandScore;
const getNextActivePlayerIndex = (currentIndex, playerIds, eliminatedPlayers) => {
    const total = playerIds.length;
    let next = (currentIndex + 1) % total;
    for (let i = 0; i < total; i++) {
        if (!eliminatedPlayers.includes(playerIds[next].toString()))
            return next;
        next = (next + 1) % total;
    }
    return next;
};
exports.getNextActivePlayerIndex = getNextActivePlayerIndex;
const getDominoGameResult = (hands, consecutive_passes, playerIds, eliminatedPlayers = []) => {
    const activePlayers = playerIds.filter(id => !eliminatedPlayers.includes(id.toString()));
    if (activePlayers.length <= 1 && activePlayers.length > 0) {
        return { finished: true, winner: activePlayers[0], reason: 'last_standing' };
    }
    for (const id of activePlayers) {
        if ((hands.get(id.toString()) || []).length === 0)
            return { finished: true, winner: id, reason: 'empty_hand' };
    }
    if (consecutive_passes >= activePlayers.length) {
        let minScore = Infinity, winners = [];
        for (const id of activePlayers) {
            const score = (0, exports.calculateHandScore)(hands.get(id.toString()) || []);
            if (score < minScore) {
                minScore = score;
                winners = [id];
            }
            else if (score === minScore)
                winners.push(id);
        }
        return winners.length === 1
            ? { finished: true, winner: winners[0], reason: 'blocked_game' }
            : { finished: true, winner: null, reason: 'draw' };
    }
    return { finished: false };
};
exports.getDominoGameResult = getDominoGameResult;
//# sourceMappingURL=domino-game.logic.js.map