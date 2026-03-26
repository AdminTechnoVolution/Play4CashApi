/** Domino (Double-6) Game Logic — TypeScript port of gameLogic.js */

export type Tile = [number, number];
export interface OpenEnds { left?: number; right?: number; }

const generateTiles = (): Tile[] => {
  const t: Tile[] = [];
  for (let i = 0; i <= 6; i++) for (let j = i; j <= 6; j++) t.push([i, j]);
  return t;
};

export const deal = (playerIds: string[]): { hands: Map<string, Tile[]>; boneyard: Tile[] } => {
  const all = generateTiles().sort(() => Math.random() - 0.5);
  const hands = new Map<string, Tile[]>();
  playerIds.forEach(id => hands.set(id, all.splice(0, 7)));
  return { hands, boneyard: all };
};

export const getStartingPlayerIndex = (playerIds: string[], hands: Map<string, Tile[]>): number => {
  let bestDouble = -1, idx = 0;
  playerIds.forEach((id, i) => {
    for (const [v1, v2] of hands.get(id) || []) {
      if (v1 === v2 && v1 > bestDouble) { bestDouble = v1; idx = i; }
    }
  });
  if (bestDouble !== -1) return idx;
  let maxSum = -1;
  playerIds.forEach((id, i) => { for (const [v1, v2] of hands.get(id) || []) if (v1 + v2 > maxSum) { maxSum = v1+v2; idx = i; } });
  return idx;
};

export const canPlayTile = (tile: Tile, openEnds: OpenEnds): boolean => {
  if (openEnds.left === undefined) return true;
  const [v1, v2] = tile;
  return v1 === openEnds.left || v2 === openEnds.left || v1 === openEnds.right || v2 === openEnds.right;
};

export const hasValidMoves = (hand: Tile[], openEnds: OpenEnds): boolean => hand.some(t => canPlayTile(t, openEnds));

export const validateMove = (tile: Tile, side: 'left' | 'right', openEnds: OpenEnds): { valid: boolean; flippedTile: Tile; side: string } => {
  if (openEnds.left === undefined) return { valid: true, flippedTile: tile, side: 'left' };
  const [v1, v2] = tile;
  let valid = false, flippedTile: Tile = [...tile] as Tile;
  if (side === 'left') {
    if (v2 === openEnds.left) valid = true;
    else if (v1 === openEnds.left) { valid = true; flippedTile = [v2, v1]; }
  } else {
    if (v1 === openEnds.right) valid = true;
    else if (v2 === openEnds.right) { valid = true; flippedTile = [v2, v1]; }
  }
  return { valid, flippedTile, side };
};

export const calculateHandScore = (hand: Tile[]): number => hand.reduce((s, [v1, v2]) => s + v1 + v2, 0);

export const getDominoGameResult = (
  hands: Map<string, Tile[]>,
  consecutive_passes: number,
  playerIds: string[],
): { finished: boolean; winner?: string | null; reason?: string } => {
  for (const id of playerIds) {
    if ((hands.get(id.toString()) || []).length === 0) return { finished: true, winner: id, reason: 'empty_hand' };
  }
  if (consecutive_passes >= playerIds.length) {
    let minScore = Infinity, winners: string[] = [];
    for (const id of playerIds) {
      const score = calculateHandScore(hands.get(id.toString()) || []);
      if (score < minScore) { minScore = score; winners = [id]; }
      else if (score === minScore) winners.push(id);
    }
    return winners.length === 1
      ? { finished: true, winner: winners[0], reason: 'blocked_game' }
      : { finished: true, winner: null, reason: 'draw' };
  }
  return { finished: false };
};
