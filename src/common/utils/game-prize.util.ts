/**
 * Total pot paid to the winner after house edge (each player staked `betAmount`).
 */
export function winnerGrossPayout(
  betAmount: number,
  houseEdgePercent: number,
  playerCount: number,
): number {
  if (playerCount < 1 || betAmount <= 0) return 0;
  return betAmount * playerCount * (1 - houseEdgePercent / 100);
}

/**
 * Amount shown as `prize` to the winner (UI / historial): stake from opponents
 * after house edge, not including the return of their own bet.
 * 1v1 with bet 10 → 10 × (1 − edge/100).
 */
export function winnerDisplayedPrize(
  betAmount: number,
  houseEdgePercent: number,
  playerCount: number,
): number {
  const opponents = Math.max(0, playerCount - 1);
  if (opponents < 1 || betAmount <= 0) return 0;
  return betAmount * opponents * (1 - houseEdgePercent / 100);
}

export function winnerBalanceUpdate(grossPayout: number): { $inc: { balance: number; total_won: number } } {
  return {
    $inc: {
      balance: grossPayout,
      total_won: grossPayout,
    },
  };
}
