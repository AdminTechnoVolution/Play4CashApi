"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createEmptyBoard = createEmptyBoard;
exports.coerceConnectFourBoard = coerceConnectFourBoard;
exports.isColumnInBounds = isColumnInBounds;
exports.findDropRow = findDropRow;
exports.isBoardFull = isBoardFull;
exports.checkWinFromCell = checkWinFromCell;
exports.dropDisc = dropDisc;
exports.colorForPlayerNum = colorForPlayerNum;
exports.playerNumForColor = playerNumForColor;
const connect_four_game_constants_1 = require("../../../common/constants/connect-four-game.constants");
function createEmptyBoard() {
    return Array.from({ length: connect_four_game_constants_1.CONNECT_FOUR_ROWS }, () => Array.from({ length: connect_four_game_constants_1.CONNECT_FOUR_COLS }, () => null));
}
function coerceConnectFourBoard(raw) {
    const base = createEmptyBoard();
    if (!Array.isArray(raw))
        return base;
    for (let row = 0; row < connect_four_game_constants_1.CONNECT_FOUR_ROWS; row++) {
        const srcRow = raw[row];
        if (!Array.isArray(srcRow))
            continue;
        for (let col = 0; col < connect_four_game_constants_1.CONNECT_FOUR_COLS; col++) {
            const cell = srcRow[col];
            base[row][col] = cell === 'R' || cell === 'Y' ? cell : null;
        }
    }
    return base;
}
function isColumnInBounds(col) {
    return Number.isInteger(col) && col >= 0 && col < connect_four_game_constants_1.CONNECT_FOUR_COLS;
}
function findDropRow(board, col) {
    for (let row = connect_four_game_constants_1.CONNECT_FOUR_ROWS - 1; row >= 0; row--) {
        if (board[row][col] === null)
            return row;
    }
    return -1;
}
function isBoardFull(board) {
    return board.every((row) => row.every((cell) => cell !== null));
}
const DIRECTIONS = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
];
function cellsInDirection(board, row, col, dr, dc, color) {
    const cells = [];
    let r = row;
    let c = col;
    while (r >= 0 &&
        r < connect_four_game_constants_1.CONNECT_FOUR_ROWS &&
        c >= 0 &&
        c < connect_four_game_constants_1.CONNECT_FOUR_COLS &&
        board[r][c] === color) {
        cells.push({ row: r, col: c });
        r += dr;
        c += dc;
    }
    return cells;
}
function checkWinFromCell(board, row, col, color) {
    for (const [dr, dc] of DIRECTIONS) {
        const forward = cellsInDirection(board, row, col, dr, dc, color);
        const backward = cellsInDirection(board, row, col, -dr, -dc, color);
        const total = forward.length + backward.length - 1;
        if (total >= connect_four_game_constants_1.CONNECT_FOUR_WIN_LENGTH) {
            const line = [...backward.slice(0, -1).reverse(), ...forward];
            const placedIdx = line.findIndex((c) => c.row === row && c.col === col);
            const start = placedIdx >= 0
                ? Math.min(Math.max(0, placedIdx - (connect_four_game_constants_1.CONNECT_FOUR_WIN_LENGTH - 1)), line.length - connect_four_game_constants_1.CONNECT_FOUR_WIN_LENGTH)
                : 0;
            return {
                won: true,
                winningCells: line.slice(start, start + connect_four_game_constants_1.CONNECT_FOUR_WIN_LENGTH),
            };
        }
    }
    return { won: false, winningCells: [] };
}
function dropDisc(board, col, color) {
    if (!isColumnInBounds(col)) {
        return { ok: false, reason: 'out_of_bounds' };
    }
    const row = findDropRow(board, col);
    if (row < 0) {
        return { ok: false, reason: 'column_full' };
    }
    const next = board.map((r) => [...r]);
    next[row][col] = color;
    const win = checkWinFromCell(next, row, col, color);
    const isDraw = !win.won && isBoardFull(next);
    return { ok: true, row, col, board: next, win, isDraw };
}
function colorForPlayerNum(playerNum) {
    return playerNum === 1 ? 'R' : 'Y';
}
function playerNumForColor(color) {
    return color === 'R' ? 1 : 2;
}
//# sourceMappingURL=connect-four-game.logic.js.map