/** Halma game logic — Checkers-style variant */

const PLAYER_A_START_ROWS = [0, 1, 2];
const PLAYER_B_START_ROWS = [5, 6, 7];
const PLAYER_A_GOAL_ROWS = [5, 6, 7];
const PLAYER_B_GOAL_ROWS = [0, 1, 2];
const DIAGONAL_DIRECTIONS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

export type HalmaBoard = number[][];

/** A square is dark if (row + col) is odd */
export const isDarkSquare = (r: number, c: number): boolean => (r + c) % 2 !== 0;

/** Player 1 moves DOWN (row increases), Player 2 moves UP (row decreases) */
export const isForwardMove = (fromRow: number, toRow: number, pNum: number): boolean =>
  pNum === 1 ? toRow > fromRow : toRow < fromRow;

/**
 * 12 pieces per player, placed on dark squares in their first 3 rows.
 * P1 (rows 0-2): Row 0 → cols 1,3,5,7 | Row 1 → cols 0,2,4,6 | Row 2 → cols 1,3,5,7
 * P2 (rows 5-7): Row 5 → cols 0,2,4,6 | Row 6 → cols 1,3,5,7 | Row 7 → cols 0,2,4,6
 */
export const createHalmaBoard = (): HalmaBoard => {
  const b: HalmaBoard = Array.from({ length: 8 }, () => Array(8).fill(0));
  // Player 1: rows 0,1,2 on dark squares
  for (const c of [1, 3, 5, 7]) b[0][c] = 1;
  for (const c of [0, 2, 4, 6]) b[1][c] = 1;
  for (const c of [1, 3, 5, 7]) b[2][c] = 1;
  // Player 2: rows 5,6,7 on dark squares
  for (const c of [0, 2, 4, 6]) b[5][c] = 2;
  for (const c of [1, 3, 5, 7]) b[6][c] = 2;
  for (const c of [0, 2, 4, 6]) b[7][c] = 2;
  return b;
};

const inBounds = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;
export const goalRowsForPlayer = (pNum: number) => pNum === 1 ? PLAYER_A_GOAL_ROWS : PLAYER_B_GOAL_ROWS;
export const isInGoalZone = (r: number, pNum: number) => goalRowsForPlayer(pNum).includes(r);

/**
 * Simple move: exactly 1 diagonal step forward to an empty dark square.
 */
export const isValidStep = (b: HalmaBoard, fr: number, fc: number, tr: number, tc: number, pNum: number): boolean => {
  if (!inBounds(tr, tc)) return false;
  if (b[fr][fc] !== pNum) return false;
  if (b[tr][tc] !== 0) return false;
  if (!isDarkSquare(tr, tc)) return false;
  if (!isForwardMove(fr, tr, pNum)) return false;
  return Math.abs(tr - fr) === 1 && Math.abs(tc - fc) === 1;
};

/**
 * Jump move: exactly 2 diagonal steps forward over any piece to an empty dark square.
 * Player is inferred from board[fr][fc] to preserve gateway signature.
 */
export const isValidJump = (b: HalmaBoard, fr: number, fc: number, tr: number, tc: number): boolean => {
  if (!inBounds(tr, tc)) return false;
  if (b[tr][tc] !== 0) return false;
  if (!isDarkSquare(tr, tc)) return false;
  const pNum = b[fr][fc];
  if (!pNum) return false;
  if (!isForwardMove(fr, tr, pNum)) return false;
  if (Math.abs(tr - fr) !== 2 || Math.abs(tc - fc) !== 2) return false;
  return b[(fr + tr) / 2][(fc + tc) / 2] !== 0;
};

export const getJumpDestinations = (b: HalmaBoard, r: number, c: number): [number, number][] =>
  DIAGONAL_DIRECTIONS
    .map(([dr, dc]) => [r + dr * 2, c + dc * 2] as [number, number])
    .filter(([jr, jc]) => isValidJump(b, r, c, jr, jc));

export const canJumpFurther = (b: HalmaBoard, r: number, c: number): boolean => getJumpDestinations(b, r, c).length > 0;

export const checkHalmaWin = (b: HalmaBoard, pNum: number): boolean => {
  const goalRows = goalRowsForPlayer(pNum);
  for (const r of goalRows) {
    for (let c = 0; c < 8; c++) {
      if (isDarkSquare(r, c) && b[r][c] !== pNum) return false;
    }
  }
  return true;
};
