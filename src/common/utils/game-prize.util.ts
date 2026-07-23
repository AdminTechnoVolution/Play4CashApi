import Decimal from 'decimal.js';

export interface WinnerSettlement {
  /** Net amount credited to the winner after the house fee. */
  balanceCredit: number;
  /** Net total pot shown as the winner's prize. */
  netPrize: number;
  /** Fee charged against the complete pot. */
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
 * House edge applies to the complete pot. The winner's own stake is not returned
 * separately because it is already part of that pot.
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
    return { balanceCredit: 0, netPrize: 0, houseFee: 0 };
  }

  const stake = new Decimal(betAmount).toDecimalPlaces(
    MONEY_DECIMAL_PLACES,
    Decimal.ROUND_HALF_UP,
  );
  const totalPot = stake.mul(Math.floor(playerCount));
  const edge = new Decimal(houseEdgePercent).clamp(0, 100).div(100);
  const netPrize = money(totalPot.mul(new Decimal(1).minus(edge)));
  const houseFee = money(totalPot.minus(netPrize));
  const balanceCredit = netPrize;

  return { balanceCredit, netPrize, houseFee };
}

/**
 * Amount shown as `prize` to the winner (UI / history): complete pot after
 * house edge. 1v1 with bet 10 → 20 × (1 − edge/100).
 */
export function winnerDisplayedPrize(
  betAmount: number,
  houseEdgePercent: number,
  playerCount: number,
): number {
  return calculateWinnerSettlement(betAmount, houseEdgePercent, playerCount)
    .netPrize;
}

export function winnerBalanceUpdate(settlement: WinnerSettlement): {
  $inc: { balance: number; total_won: number };
} {
  return {
    $inc: {
      balance: settlement.balanceCredit,
      total_won: settlement.netPrize,
    },
  };
}
