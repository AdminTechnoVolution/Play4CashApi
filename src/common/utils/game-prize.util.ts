import Decimal from 'decimal.js';

export interface WinnerSettlement {
  /** Own stake returned in full plus net winnings from opponents. */
  balanceCredit: number;
  /** Opponents' stakes after the house fee; this is the prize shown to the winner. */
  netWinnings: number;
  /** Fee charged only against opponents' stakes. */
  houseFee: number;
}

const MONEY_DECIMAL_PLACES = 2;

function money(value: Decimal): number {
  return value
    .toDecimalPlaces(MONEY_DECIMAL_PLACES, Decimal.ROUND_HALF_UP)
    .toNumber();
}

/**
 * Settles a winner after every player already paid `betAmount` at match start.
 * The winner's own stake is returned without a fee; house edge applies only to
 * the stakes won from opponents.
 */
export function calculateWinnerSettlement(
  betAmount: number,
  houseEdgePercent: number,
  playerCount: number,
): WinnerSettlement {
  if (
    !Number.isFinite(betAmount) ||
    !Number.isFinite(houseEdgePercent) ||
    !Number.isFinite(playerCount) ||
    playerCount < 1 ||
    betAmount <= 0
  ) {
    return { balanceCredit: 0, netWinnings: 0, houseFee: 0 };
  }

  const stake = new Decimal(betAmount).toDecimalPlaces(
    MONEY_DECIMAL_PLACES,
    Decimal.ROUND_HALF_UP,
  );
  const opponents = Math.max(0, Math.floor(playerCount) - 1);
  const opponentStakes = stake.mul(opponents);
  const edge = new Decimal(houseEdgePercent).clamp(0, 100).div(100);
  const netWinnings = money(opponentStakes.mul(new Decimal(1).minus(edge)));
  const houseFee = money(opponentStakes.minus(netWinnings));
  const balanceCredit = money(stake.plus(netWinnings));

  return { balanceCredit, netWinnings, houseFee };
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
  return calculateWinnerSettlement(betAmount, houseEdgePercent, playerCount)
    .netWinnings;
}

export function winnerBalanceUpdate(settlement: WinnerSettlement): {
  $inc: { balance: number; total_won: number };
} {
  return {
    $inc: {
      balance: settlement.balanceCredit,
      total_won: settlement.netWinnings,
    },
  };
}
