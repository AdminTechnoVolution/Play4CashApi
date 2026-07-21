import {
  calculateWinnerSettlement,
  winnerBalanceUpdate,
  winnerDisplayedPrize,
} from './game-prize.util';

describe('game prize settlement', () => {
  it('returns the winner own stake and charges the edge only on the opponent stake', () => {
    const settlement = calculateWinnerSettlement(20, 5, 2);

    expect(settlement).toEqual({
      balanceCredit: 39,
      netWinnings: 19,
      houseFee: 1,
    });
    expect(118 - 20 + settlement.balanceCredit).toBe(137);
    expect(winnerDisplayedPrize(20, 5, 2)).toBe(19);
  });

  it.each([
    { edge: 0, expected: { balanceCredit: 40, netWinnings: 20, houseFee: 0 } },
    { edge: 5, expected: { balanceCredit: 39, netWinnings: 19, houseFee: 1 } },
    {
      edge: 100,
      expected: { balanceCredit: 20, netWinnings: 0, houseFee: 20 },
    },
  ])('settles a two-player match with $edge% edge', ({ edge, expected }) => {
    expect(calculateWinnerSettlement(20, edge, 2)).toEqual(expected);
  });

  it('settles multiplayer winnings and conserves the complete pot', () => {
    const settlement = calculateWinnerSettlement(20, 5, 4);

    expect(settlement).toEqual({
      balanceCredit: 77,
      netWinnings: 57,
      houseFee: 3,
    });
    expect(settlement.balanceCredit + settlement.houseFee).toBe(80);
  });

  it('rounds monetary values to two decimal places', () => {
    expect(calculateWinnerSettlement(7.33, 5, 3)).toEqual({
      balanceCredit: 21.26,
      netWinnings: 13.93,
      houseFee: 0.73,
    });
  });

  it('tracks only net winnings in total_won', () => {
    const settlement = calculateWinnerSettlement(20, 5, 2);

    expect(winnerBalanceUpdate(settlement)).toEqual({
      $inc: { balance: 39, total_won: 19 },
    });
  });

  it('returns zero values for a free or invalid settlement', () => {
    expect(calculateWinnerSettlement(0, 5, 2)).toEqual({
      balanceCredit: 0,
      netWinnings: 0,
      houseFee: 0,
    });
    expect(calculateWinnerSettlement(Number.NaN, 5, 2)).toEqual({
      balanceCredit: 0,
      netWinnings: 0,
      houseFee: 0,
    });
  });
});
