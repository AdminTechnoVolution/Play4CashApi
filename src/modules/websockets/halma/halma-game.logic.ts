/** Halma game logic — Checkers-style variant */

const PLAYER_A_START_ROWS = [0, 1, 2];
const PLAYER_B_START_ROWS = [5, 6, 7];
const PLAYER_A_GOAL_ROWS = [5, 6, 7];
const PLAYER_B_GOAL_ROWS = [0, 1, 2];
const DIAGONAL_DIRECTIONS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

export type HalmaBoard = number[][];

/** A square is dark if (row + col) is odd */
export const isDarkSquare = (r: number, c: number): boolean => (r + c) % 2 !== 0;

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

/** Constants for piece types */
export const P1_NORMAL = 1;
export const P2_NORMAL = 2;
export const P1_KING = 3;
export const P2_KING = 4;

const inBounds = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;
export const goalRowsForPlayer = (pNum: number) => pNum === 1 ? PLAYER_A_GOAL_ROWS : PLAYER_B_GOAL_ROWS;
export const isInGoalZone = (r: number, pNum: number) => goalRowsForPlayer(pNum).includes(r);

/**
 * Returns true if a piece belongs to the given player number.
 */
export const isOwner = (piece: number, pNum: number): boolean => {
  if (pNum === 1) return piece === P1_NORMAL || piece === P1_KING;
  if (pNum === 2) return piece === P2_NORMAL || piece === P2_KING;
  return false;
};

/**
 * Simple move: 
 * - Normal: 1 diagonal step.
 * - King: Any distance, path must be clear.
 */
export const isValidStep = (b: HalmaBoard, fr: number, fc: number, tr: number, tc: number, pNum: number): boolean => {
  if (!inBounds(tr, tc)) return false;
  const piece = b[fr][fc];
  if (!isOwner(piece, pNum)) return false;
  if (b[tr][tc] !== 0) return false;
  if (!isDarkSquare(tr, tc)) return false;

  const dr = tr - fr;
  const dc = tc - fc;
  const absDr = Math.abs(dr);
  const absDc = Math.abs(dc);

  if (absDr !== absDc) return false; // Must be diagonal

  if (piece === P1_KING || piece === P2_KING) {
    // King: any distance, clear path
    const unitR = dr / absDr;
    const unitC = dc / absDc;
    for (let i = 1; i < absDr; i++) {
        if (b[fr + i * unitR][fc + i * unitC] !== 0) return false;
    }
    return true;
  } else {
    // Normal: 1 step
    return absDr === 1;
  }
};

/**
 * Jump move: 
 * - Normal: Exactly 2 steps over 1 piece.
 * - King: Any distance over 1 piece, land anywhere behind it.
 */
export const isValidJump = (b: HalmaBoard, fr: number, fc: number, tr: number, tc: number): boolean => {
  if (!inBounds(tr, tc)) return false;
  if (b[tr][tc] !== 0) return false;
  if (!isDarkSquare(tr, tc)) return false;
  const piece = b[fr][fc];
  if (!piece) return false;

  const dr = tr - fr;
  const dc = tc - fc;
  const absDr = Math.abs(dr);
  const absDc = Math.abs(dc);

  if (absDr !== absDc) return false; // Must be diagonal

  const unitR = dr / absDr;
  const unitC = dc / absDc;

  if (piece === P1_KING || piece === P2_KING) {
    // King: Flying jump over exactly ONE piece
    let pieceCount = 0;
    for (let i = 1; i < absDr; i++) {
        if (b[fr + i * unitR][fc + i * unitC] !== 0) {
            pieceCount++;
        }
    }
    return pieceCount === 1;
  } else {
    // Normal: Distance 2 over 1 piece
    if (absDr !== 2) return false;
    return b[fr + unitR][fc + unitC] !== 0;
  }
};

export const getJumpDestinations = (b: HalmaBoard, r: number, c: number): [number, number][] => {
  const piece = b[r][c];
  if (!piece) return [];
  const dests: [number, number][] = [];

  if (piece === P1_KING || piece === P2_KING) {
    // Scans all diagonal paths for possible flying jumps
    for (const [dr, dc] of DIAGONAL_DIRECTIONS) {
      for (let dist = 2; dist < 8; dist++) {
        const tr = r + dr * dist;
        const tc = c + dc * dist;
        if (inBounds(tr, tc) && isValidJump(b, r, c, tr, tc)) {
          dests.push([tr, tc]);
        }
      }
    }
  } else {
    // Normal pieces: only distance 2
    for (const [dr, dc] of DIAGONAL_DIRECTIONS) {
      const tr = r + dr * 2;
      const tc = c + dc * 2;
      if (isValidJump(b, r, c, tr, tc)) {
        dests.push([tr, tc]);
      }
    }
  }
  return dests;
};

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
