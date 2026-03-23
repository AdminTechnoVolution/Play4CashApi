/**
 * Domino (Double-6) Game Logic
 */

const TILES_COUNT = 28;

/**
 * Generates all 28 tiles for Double-6 Domino.
 */
const generateTiles = () => {
    const tiles = [];
    for (let i = 0; i <= 6; i++) {
        for (let j = i; j <= 6; j++) {
            tiles.push([i, j]);
        }
    }
    return tiles;
};

/**
 * Shuffles an array of tiles.
 */
const shuffle = (tiles) => {
    for (let i = tiles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
    }
    return tiles;
};

/**
 * Deals 7 tiles to each player.
 * Returns { hands, boneyard }
 */
const deal = (playerIds) => {
    const allTiles = shuffle(generateTiles());
    const hands = new Map();
    const tilesPerPlayer = 7;

    playerIds.forEach((id, index) => {
        hands.set(id.toString(), allTiles.splice(0, tilesPerPlayer));
    });

    return { hands, boneyard: allTiles };
};

/**
 * Determines the starting player based on the highest double.
 * If no doubles, fallback to the player with the highest single tile.
 */
const getStartingPlayerIndex = (playerIds, hands) => {
    let bestDouble = -1;
    let startingIndex = 0;

    playerIds.forEach((id, index) => {
        const hand = hands.get(id.toString());
        hand.forEach(([v1, v2]) => {
            if (v1 === v2 && v1 > bestDouble) {
                bestDouble = v1;
                startingIndex = index;
            }
        });
    });

    if (bestDouble !== -1) return startingIndex;

    // Fallback: highest sum
    let maxSum = -1;
    playerIds.forEach((id, index) => {
        const hand = hands.get(id.toString());
        hand.forEach(([v1, v2]) => {
            if (v1 + v2 > maxSum) {
                maxSum = v1 + v2;
                startingIndex = index;
            }
        });
    });

    return startingIndex;
};

/**
 * Checks if a tile can be played on either end of the board.
 */
const canPlayTile = (tile, openEnds) => {
    if (!openEnds || openEnds.left === undefined) return true; // Empty board
    const [v1, v2] = tile;
    return v1 === openEnds.left || v2 === openEnds.left || v1 === openEnds.right || v2 === openEnds.right;
};

/**
 * Checks if a player has any valid moves.
 */
const hasValidMoves = (hand, openEnds) => {
    return hand.some(tile => canPlayTile(tile, openEnds));
};

/**
 * Validates and prepares a move.
 * Returns { valid: boolean, flippedTile: [number, number], side: 'left'|'right' }
 */
const validateMove = (tile, side, openEnds) => {
    if (!openEnds || openEnds.left === undefined) {
        return { valid: true, flippedTile: tile, side: 'left' };
    }

    const [v1, v2] = tile;
    let valid = false;
    let flippedTile = [...tile];

    if (side === 'left') {
        if (v2 === openEnds.left) {
            valid = true;
        } else if (v1 === openEnds.left) {
            valid = true;
            flippedTile = [v2, v1];
        }
    } else if (side === 'right') {
        if (v1 === openEnds.right) {
            valid = true;
        } else if (v2 === openEnds.right) {
            valid = true;
            flippedTile = [v2, v1];
        }
    }

    return { valid, flippedTile, side };
};

/**
 * Calculates the total pips in a player's hand.
 */
const calculateHandScore = (hand) => {
    return hand.reduce((sum, [v1, v2]) => sum + v1 + v2, 0);
};

/**
 * Determines the game result if blocked or finished.
 */
const getGameResult = (game, playerIds) => {
    // 1. Check if anyone finished their hand
    for (let i = 0; i < playerIds.length; i++) {
        const id = playerIds[i].toString();
        if (game.hands.get(id).length === 0) {
            return { finished: true, winner: playerIds[i], reason: 'empty_hand' };
        }
    }

    // 2. Check if blocked
    if (game.consecutive_passes >= playerIds.length) {
        let minScore = Infinity;
        let winners = [];

        playerIds.forEach(id => {
            const score = calculateHandScore(game.hands.get(id.toString()));
            if (score < minScore) {
                minScore = score;
                winners = [id];
            } else if (score === minScore) {
                winners.push(id);
            }
        });

        if (winners.length === 1) {
            return { finished: true, winner: winners[0], reason: 'blocked_game' };
        } else {
            return { finished: true, winner: null, reason: 'draw' };
        }
    }

    return { finished: false };
};

module.exports = {
    deal,
    getStartingPlayerIndex,
    hasValidMoves,
    validateMove,
    calculateHandScore,
    getGameResult
};
