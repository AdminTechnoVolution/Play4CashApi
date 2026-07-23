import {
  calculateWinnerSettlement,
  winnerBalanceUpdate,
  winnerDisplayedPrize,
} from './game-prize.util';

describe('game prize settlement', () => {
  it('credits the complete pot after charging the house edge', () => {
    const settlement = calculateWinnerSettlement(20, 5, 2);

    expect(settlement).toEqual({
      balanceCredit: 38,
      netPrize: 38,
      houseFee: 2,
    });
    expect(100 - 20 + settlement.balanceCredit).toBe(118);
    expect(winnerDisplayedPrize(20, 5, 2)).toBe(38);
  });

  it.each([
    { edge: 0, expected: { balanceCredit: 40, netPrize: 40, houseFee: 0 } },
    { edge: 5, expected: { balanceCredit: 38, netPrize: 38, houseFee: 2 } },
    {
      edge: 100,
      expected: { balanceCredit: 0, netPrize: 0, houseFee: 40 },
    },
  ])('settles a two-player match with $edge% edge', ({ edge, expected }) => {
    expect(calculateWinnerSettlement(20, edge, 2)).toEqual(expected);
  });

  it('settles multiplayer winnings and conserves the complete pot', () => {
    const settlement = calculateWinnerSettlement(20, 5, 4);

    expect(settlement).toEqual({
      balanceCredit: 76,
      netPrize: 76,
      houseFee: 4,
    });
    expect(settlement.balanceCredit + settlement.houseFee).toBe(80);
  });

  it('charges the house edge against a three-player complete pot', () => {
    expect(calculateWinnerSettlement(10, 5, 3)).toEqual({
      balanceCredit: 28.5,
      netPrize: 28.5,
      houseFee: 1.5,
    });
  });

  it('rounds monetary values to two decimal places', () => {
    expect(calculateWinnerSettlement(7.33, 5, 3)).toEqual({
      balanceCredit: 20.89,
      netPrize: 20.89,
      houseFee: 1.1,
    });
  });

  it('tracks the complete net prize in total_won', () => {
    const settlement = calculateWinnerSettlement(20, 5, 2);

    expect(winnerBalanceUpdate(settlement)).toEqual({
      $inc: { balance: 38, total_won: 38 },
    });
  });

  it('returns zero values for a free or invalid settlement', () => {
    expect(calculateWinnerSettlement(0, 5, 2)).toEqual({
      balanceCredit: 0,
      netPrize: 0,
      houseFee: 0,
    });
    expect(calculateWinnerSettlement(Number.NaN, 5, 2)).toEqual({
      balanceCredit: 0,
      netPrize: 0,
      houseFee: 0,
    });
  });
});
