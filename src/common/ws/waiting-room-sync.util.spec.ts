import {
  INITIAL_STATE_RECOVERY_GRACE_SECONDS,
  initialTurnDeadlineSeconds,
} from './waiting-room-sync.util';

describe('waiting-room initial state recovery', () => {
  it('adds one bounded recovery window to the initial turn deadline', () => {
    expect(INITIAL_STATE_RECOVERY_GRACE_SECONDS).toBe(20);
    expect(initialTurnDeadlineSeconds(30)).toBe(50);
    expect(initialTurnDeadlineSeconds(45)).toBe(65);
  });
});
