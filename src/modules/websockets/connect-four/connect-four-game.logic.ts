import {
  CONNECT_FOUR_COLS,
  CONNECT_FOUR_ROWS,
  CONNECT_FOUR_WIN_LENGTH,
} from '../../../common/constants/connect-four-game.constants';

export type ConnectFourColor = 'R' | 'Y';
export type ConnectFourCell = null | ConnectFourColor;

export type ConnectFourBoard = ConnectFourCell[][];

export interface ConnectFourWinResult {
  won: boolean;
  winningCells: Array<{ row: number; col: number }>;
}

export interface DropDiscResult {
  ok: true;
  row: number;
  col: number;
  board: ConnectFourBoard;
  win: ConnectFourWinResult;
  isDraw: boolean;
}

export interface DropDiscError {
  ok: false;
  reason: 'invalid_column' | 'column_full' | 'out_of_bounds';
}

/** Empty 6×7 board (row 0 = top, row 5 = bottom). */
export function createEmptyBoard(): ConnectFourBoard {
  return Array.from({ length: CONNECT_FOUR_ROWS }, () =>
    Array.from({ length: CONNECT_FOUR_COLS }, () => null),
  );
}

export function isColumnInBounds(col: number): boolean {
  return Number.isInteger(col) && col >= 0 && col < CONNECT_FOUR_COLS;
}

/** Lowest empty row in column, or -1 if full. */
export function findDropRow(board: ConnectFourBoard, col: number): number {
  for (let row = CONNECT_FOUR_ROWS - 1; row >= 0; row--) {
    if (board[row][col] === null) return row;
  }
  return -1;
}

export function isBoardFull(board: ConnectFourBoard): boolean {
  return board.every((row) => row.every((cell) => cell !== null));
}

/** Horizontal, vertical, descending diagonal (↘), ascending diagonal (↗). */
const DIRECTIONS: Array<[number, number]> = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

function cellsInDirection(
  board: ConnectFourBoard,
  row: number,
  col: number,
  dr: number,
  dc: number,
  color: ConnectFourColor,
): Array<{ row: number; col: number }> {
  const cells: Array<{ row: number; col: number }> = [];
  let r = row;
  let c = col;
  while (
    r >= 0 &&
    r < CONNECT_FOUR_ROWS &&
    c >= 0 &&
    c < CONNECT_FOUR_COLS &&
    board[r][c] === color
  ) {
    cells.push({ row: r, col: c });
    r += dr;
    c += dc;
  }
  return cells;
}

/**
 * Four-in-a-row from the last disc placed at (row, col).
 * Counts consecutive same-color discs in both directions per axis; never reads client input.
 */
export function checkWinFromCell(
  board: ConnectFourBoard,
  row: number,
  col: number,
  color: ConnectFourColor,
): ConnectFourWinResult {
  for (const [dr, dc] of DIRECTIONS) {
    const forward = cellsInDirection(board, row, col, dr, dc, color);
    const backward = cellsInDirection(board, row, col, -dr, -dc, color);
    const total = forward.length + backward.length - 1;
    if (total >= CONNECT_FOUR_WIN_LENGTH) {
      const line = [...backward.slice(0, -1).reverse(), ...forward];
      const placedIdx = line.findIndex((c) => c.row === row && c.col === col);
      const start =
        placedIdx >= 0
          ? Math.min(
              Math.max(0, placedIdx - (CONNECT_FOUR_WIN_LENGTH - 1)),
              line.length - CONNECT_FOUR_WIN_LENGTH,
            )
          : 0;
      return {
        won: true,
        winningCells: line.slice(start, start + CONNECT_FOUR_WIN_LENGTH),
      };
    }
  }
  return { won: false, winningCells: [] };
}

/**
 * Server-authoritative drop: column only in, row/color/win/draw derived here.
 * Client must never supply board, row, color, or win metadata.
 */
export function dropDisc(
  board: ConnectFourBoard,
  col: number,
  color: ConnectFourColor,
): DropDiscResult | DropDiscError {
  if (!isColumnInBounds(col)) {
    return { ok: false, reason: 'out_of_bounds' };
  }
  const row = findDropRow(board, col);
  if (row < 0) {
    return { ok: false, reason: 'column_full' };
  }

  const next: ConnectFourBoard = board.map((r) => [...r]);
  next[row][col] = color;
  const win = checkWinFromCell(next, row, col, color);
  const isDraw = !win.won && isBoardFull(next);

  return { ok: true, row, col, board: next, win, isDraw };
}

export function colorForPlayerNum(playerNum: 1 | 2): ConnectFourColor {
  return playerNum === 1 ? 'R' : 'Y';
}

export function playerNumForColor(color: ConnectFourColor): 1 | 2 {
  return color === 'R' ? 1 : 2;
}
