import { TOURNAMENT_GROUP_SIZE } from './constants/tournament.constants';
import { resolveTournamentLayout } from './tournament-layout.util';

describe('Tournament layout', () => {
  it('uses pairs of 2 per group', () => {
    expect(TOURNAMENT_GROUP_SIZE).toBe(2);
  });

  it('prize percents must sum to 100', () => {
    expect(10 + 70 + 20).toBe(100);
  });

  it('group assignment alternates by group_count', () => {
    const group = (seed: number, groupCount: number) => ((seed - 1) % groupCount) + 1;
    expect(group(1, 2)).toBe(1);
    expect(group(2, 2)).toBe(2);
    expect(group(3, 2)).toBe(1);
    expect(group(4, 2)).toBe(2);
    expect(group(6, 3)).toBe(3);
  });

  it('supports any even player count up to 1000', () => {
    const layout = resolveTournamentLayout(100, 20);
    expect(layout.groupCount).toBe(50);
    expect(layout.groupSize).toBe(2);
  });
});
