import { computeTurnDeadlineAt } from './game-state-version.util';

describe('game-state-version.util', () => {
  it('computes turn deadline from turn start + seconds', () => {
    const start = new Date('2026-01-01T12:00:00.000Z');
    const deadline = computeTurnDeadlineAt(start, 30);
    expect(deadline).toBe('2026-01-01T12:00:30.000Z');
  });

  it('returns null when timer is zero', () => {
    expect(computeTurnDeadlineAt(new Date(), 0)).toBeNull();
  });
});
