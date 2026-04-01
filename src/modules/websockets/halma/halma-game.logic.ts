/** Halma game logic — TypeScript port of gameUtils.js */

const PLAYER_A_START_ROWS = [0, 1];
const PLAYER_B_START_ROWS = [6, 7];
const PLAYER_A_GOAL_ROWS = [6, 7];
const PLAYER_B_GOAL_ROWS = [0, 1];
const DIRECTIONS = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];

export type HalmaBoard = number[][];

export const createHalmaBoard = (): HalmaBoard => {
  const b: HalmaBoard = Array.from({ length: 8 }, () => Array(8).fill(0));
  for (const r of PLAYER_A_START_ROWS) for (let c = 0; c < 8; c++) b[r][c] = 1;
  for (const r of PLAYER_B_START_ROWS) for (let c = 0; c < 8; c++) b[r][c] = 2;
  return b;
};

const inBounds = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;
export const goalRowsForPlayer = (pNum: number) => pNum === 1 ? PLAYER_A_GOAL_ROWS : PLAYER_B_GOAL_ROWS;
export const isInGoalZone = (r: number, pNum: number) => goalRowsForPlayer(pNum).includes(r);

export const isValidStep = (b: HalmaBoard, fr: number, fc: number, tr: number, tc: number, pNum: number): boolean => {
  if (!inBounds(tr, tc)) return false;
  if (b[fr][fc] !== pNum) return false;
  if (b[tr][tc] !== 0) return false;
  return Math.abs(tr-fr) <= 1 && Math.abs(tc-fc) <= 1 && (Math.abs(tr-fr)+Math.abs(tc-fc)) > 0;
};

export const isValidJump = (b: HalmaBoard, fr: number, fc: number, tr: number, tc: number): boolean => {
  if (!inBounds(tr, tc) || b[tr][tc] !== 0) return false;
  const [dr, dc] = [tr-fr, tc-fc];
  if ((Math.abs(dr) !== 2 && Math.abs(dr) !== 0) || (Math.abs(dc) !== 2 && Math.abs(dc) !== 0)) return false;
  if (dr === 0 && dc === 0) return false;
  return b[fr+dr/2][fc+dc/2] !== 0;
};

export const getJumpDestinations = (b: HalmaBoard, r: number, c: number): [number, number][] =>
  DIRECTIONS.map(([dr, dc]) => [r+dr*2, c+dc*2] as [number, number]).filter(([jr, jc]) => isValidJump(b, r, c, jr, jc));

export const canJumpFurther = (b: HalmaBoard, r: number, c: number): boolean => getJumpDestinations(b, r, c).length > 0;

export const checkHalmaWin = (b: HalmaBoard, pNum: number): boolean => {
  for (const r of goalRowsForPlayer(pNum)) for (let c = 0; c < 8; c++) if (b[r][c] !== pNum) return false;
  return true;
};
