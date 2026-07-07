"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkHalmaWin = exports.canJumpFurther = exports.getJumpDestinations = exports.isValidJump = exports.isValidStep = exports.isOwner = exports.isInGoalZone = exports.goalRowsForPlayer = exports.P2_KING = exports.P1_KING = exports.P2_NORMAL = exports.P1_NORMAL = exports.createHalmaBoard = exports.isDarkSquare = void 0;
const PLAYER_A_START_ROWS = [0, 1, 2];
const PLAYER_B_START_ROWS = [5, 6, 7];
const PLAYER_A_GOAL_ROWS = [5, 6, 7];
const PLAYER_B_GOAL_ROWS = [0, 1, 2];
const DIAGONAL_DIRECTIONS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const isDarkSquare = (r, c) => (r + c) % 2 !== 0;
exports.isDarkSquare = isDarkSquare;
const createHalmaBoard = () => {
    const b = Array.from({ length: 8 }, () => Array(8).fill(0));
    for (const c of [1, 3, 5, 7])
        b[0][c] = 1;
    for (const c of [0, 2, 4, 6])
        b[1][c] = 1;
    for (const c of [1, 3, 5, 7])
        b[2][c] = 1;
    for (const c of [0, 2, 4, 6])
        b[5][c] = 2;
    for (const c of [1, 3, 5, 7])
        b[6][c] = 2;
    for (const c of [0, 2, 4, 6])
        b[7][c] = 2;
    return b;
};
exports.createHalmaBoard = createHalmaBoard;
exports.P1_NORMAL = 1;
exports.P2_NORMAL = 2;
exports.P1_KING = 3;
exports.P2_KING = 4;
const inBounds = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const goalRowsForPlayer = (pNum) => pNum === 1 ? PLAYER_A_GOAL_ROWS : PLAYER_B_GOAL_ROWS;
exports.goalRowsForPlayer = goalRowsForPlayer;
const isInGoalZone = (r, pNum) => (0, exports.goalRowsForPlayer)(pNum).includes(r);
exports.isInGoalZone = isInGoalZone;
const isOwner = (piece, pNum) => {
    if (pNum === 1)
        return piece === exports.P1_NORMAL || piece === exports.P1_KING;
    if (pNum === 2)
        return piece === exports.P2_NORMAL || piece === exports.P2_KING;
    return false;
};
exports.isOwner = isOwner;
const isValidStep = (b, fr, fc, tr, tc, pNum) => {
    if (!inBounds(tr, tc))
        return false;
    const piece = b[fr][fc];
    if (!(0, exports.isOwner)(piece, pNum))
        return false;
    if (b[tr][tc] !== 0)
        return false;
    if (!(0, exports.isDarkSquare)(tr, tc))
        return false;
    const dr = tr - fr;
    const dc = tc - fc;
    const absDr = Math.abs(dr);
    const absDc = Math.abs(dc);
    if (absDr !== absDc)
        return false;
    if (piece === exports.P1_KING || piece === exports.P2_KING) {
        const unitR = dr / absDr;
        const unitC = dc / absDc;
        for (let i = 1; i < absDr; i++) {
            if (b[fr + i * unitR][fc + i * unitC] !== 0)
                return false;
        }
        return true;
    }
    else {
        return absDr === 1;
    }
};
exports.isValidStep = isValidStep;
const isValidJump = (b, fr, fc, tr, tc) => {
    if (!inBounds(tr, tc))
        return false;
    if (b[tr][tc] !== 0)
        return false;
    if (!(0, exports.isDarkSquare)(tr, tc))
        return false;
    const piece = b[fr][fc];
    if (!piece)
        return false;
    const dr = tr - fr;
    const dc = tc - fc;
    const absDr = Math.abs(dr);
    const absDc = Math.abs(dc);
    if (absDr !== absDc)
        return false;
    const unitR = dr / absDr;
    const unitC = dc / absDc;
    if (piece === exports.P1_KING || piece === exports.P2_KING) {
        let pieceCount = 0;
        for (let i = 1; i < absDr; i++) {
            if (b[fr + i * unitR][fc + i * unitC] !== 0) {
                pieceCount++;
            }
        }
        return pieceCount === 1;
    }
    else {
        if (absDr !== 2)
            return false;
        return b[fr + unitR][fc + unitC] !== 0;
    }
};
exports.isValidJump = isValidJump;
const getJumpDestinations = (b, r, c) => {
    const piece = b[r][c];
    if (!piece)
        return [];
    const dests = [];
    if (piece === exports.P1_KING || piece === exports.P2_KING) {
        for (const [dr, dc] of DIAGONAL_DIRECTIONS) {
            for (let dist = 2; dist < 8; dist++) {
                const tr = r + dr * dist;
                const tc = c + dc * dist;
                if (inBounds(tr, tc) && (0, exports.isValidJump)(b, r, c, tr, tc)) {
                    dests.push([tr, tc]);
                }
            }
        }
    }
    else {
        for (const [dr, dc] of DIAGONAL_DIRECTIONS) {
            const tr = r + dr * 2;
            const tc = c + dc * 2;
            if ((0, exports.isValidJump)(b, r, c, tr, tc)) {
                dests.push([tr, tc]);
            }
        }
    }
    return dests;
};
exports.getJumpDestinations = getJumpDestinations;
const canJumpFurther = (b, r, c) => (0, exports.getJumpDestinations)(b, r, c).length > 0;
exports.canJumpFurther = canJumpFurther;
const checkHalmaWin = (b, pNum) => {
    const goalRows = (0, exports.goalRowsForPlayer)(pNum);
    for (const r of goalRows) {
        for (let c = 0; c < 8; c++) {
            if ((0, exports.isDarkSquare)(r, c) && b[r][c] !== pNum)
                return false;
        }
    }
    return true;
};
exports.checkHalmaWin = checkHalmaWin;
//# sourceMappingURL=halma-game.logic.js.map