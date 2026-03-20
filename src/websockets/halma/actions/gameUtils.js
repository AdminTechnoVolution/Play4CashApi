/**
 * Halma (8×8 variant) game logic utilities.
 *
 * Board encoding:
 *   0 = empty
 *   1 = Player A piece  (starts rows 0-1, goals rows 6-7)
 *   2 = Player B piece  (starts rows 6-7, goals rows 0-1)
 *
 * Player A: occupies rows 0–1 at game start (16 pieces)
 * Player B: occupies rows 6–7 at game start (16 pieces)
 *
 * Win condition:
 *   Player A wins when ALL of rows 6–7 contain only Player A pieces.
 *   Player B wins when ALL of rows 0–1 contain only Player B pieces.
 */

// Starting rows per player
const PLAYER_A_START_ROWS = [0, 1];
const PLAYER_B_START_ROWS = [6, 7];

// Goal rows per player (opponent's starting zone)
const PLAYER_A_GOAL_ROWS = [6, 7];
const PLAYER_B_GOAL_ROWS = [0, 1];

const DIRECTIONS = [
    [-1,-1], [-1, 0], [-1, 1],
    [ 0,-1],          [ 0, 1],
    [ 1,-1], [ 1, 0], [ 1, 1],
];

// ─── Board helpers ────────────────────────────────────────────────────────────

function createInitialBoard() {
    const board = Array.from({ length: 8 }, () => Array(8).fill(0));
    // Player A occupies rows 0–1
    for (const r of PLAYER_A_START_ROWS) {
        for (let c = 0; c < 8; c++) board[r][c] = 1;
    }
    // Player B occupies rows 6–7
    for (const r of PLAYER_B_START_ROWS) {
        for (let c = 0; c < 8; c++) board[r][c] = 2;
    }
    return board;
}

function inBounds(r, c) {
    return r >= 0 && r < 8 && c >= 0 && c < 8;
}

// ─── Goal-zone helpers ────────────────────────────────────────────────────────

function goalRowsForPlayer(playerNum) {
    return playerNum === 1 ? PLAYER_A_GOAL_ROWS : PLAYER_B_GOAL_ROWS;
}

/** True when (r) is inside the player's goal zone. */
function isInGoalZone(r, playerNum) {
    return goalRowsForPlayer(playerNum).includes(r);
}

// ─── Move validation ──────────────────────────────────────────────────────────

/**
 * Valid simple step: move one cell in any of 8 directions to an empty cell.
 * Piece must belong to playerNum. Destination must be in-bounds and empty.
 */
function isValidStep(board, fr, fc, tr, tc, playerNum) {
    if (!inBounds(tr, tc)) return false;
    if (board[fr][fc] !== playerNum) return false;
    if (board[tr][tc] !== 0) return false;
    const dr = Math.abs(tr - fr);
    const dc = Math.abs(tc - fc);
    return dr <= 1 && dc <= 1 && (dr + dc > 0);
}

/**
 * Valid jump: leap over exactly one adjacent piece (own or opponent)
 * to the empty cell immediately beyond it.
 */
function isValidJump(board, fr, fc, tr, tc) {
    if (!inBounds(tr, tc)) return false;
    if (board[tr][tc] !== 0) return false;

    const dr = tr - fr;
    const dc = tc - fc;

    // Must move exactly 2 steps on one or both axes
    if (Math.abs(dr) !== 2 && Math.abs(dr) !== 0) return false;
    if (Math.abs(dc) !== 2 && Math.abs(dc) !== 0) return false;
    if (dr === 0 && dc === 0) return false;

    const midR = fr + dr / 2;
    const midC = fc + dc / 2;
    return board[midR][midC] !== 0; // must jump over a piece
}

/** All valid single-jump destinations from (r, c). */
function getJumpDestinations(board, r, c) {
    const destinations = [];
    for (const [dr, dc] of DIRECTIONS) {
        const jr = r + dr * 2;
        const jc = c + dc * 2;
        if (isValidJump(board, r, c, jr, jc)) {
            destinations.push([jr, jc]);
        }
    }
    return destinations;
}

/** Can the piece at (r,c) still jump? Used for chain-jump detection. */
function canJumpFurther(board, r, c) {
    return getJumpDestinations(board, r, c).length > 0;
}

// ─── Win condition ────────────────────────────────────────────────────────────

/**
 * Player wins when every cell in the opponent's starting zone is occupied
 * by the winning player's pieces.
 */
function checkWin(board, playerNum) {
    const goalRows = goalRowsForPlayer(playerNum);
    for (const r of goalRows) {
        for (let c = 0; c < 8; c++) {
            if (board[r][c] !== playerNum) return false;
        }
    }
    return true;
}

module.exports = {
    createInitialBoard,
    isValidStep,
    isValidJump,
    getJumpDestinations,
    canJumpFurther,
    checkWin,
    isInGoalZone,
    goalRowsForPlayer,
};
