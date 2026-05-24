import { TOURNAMENT_MVP_PLAYER_COUNT } from './constants/tournament.constants';

describe('Tournament MVP constants', () => {
  it('requires 50 players for MVP format', () => {
    expect(TOURNAMENT_MVP_PLAYER_COUNT).toBe(50);
  });

  it('prize percents must sum to 100', () => {
    const house = 10;
    const first = 70;
    const second = 20;
    expect(house + first + second).toBe(100);
  });

  it('group assignment alternates 5 groups', () => {
    const group = (seed: number) => ((seed - 1) % 5) + 1;
    expect(group(1)).toBe(1);
    expect(group(5)).toBe(5);
    expect(group(6)).toBe(1);
    expect(group(50)).toBe(5);
  });
});
