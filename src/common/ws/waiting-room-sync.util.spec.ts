import {
  INITIAL_STATE_RECOVERY_GRACE_SECONDS,
  buildFinishedRoomSyncData,
  initialTurnDeadlineSeconds,
} from './waiting-room-sync.util';

describe('waiting-room initial state recovery', () => {
  it('adds one bounded recovery window to the initial turn deadline', () => {
    expect(INITIAL_STATE_RECOVERY_GRACE_SECONDS).toBe(20);
    expect(initialTurnDeadlineSeconds(30)).toBe(50);
    expect(initialTurnDeadlineSeconds(45)).toBe(65);
  });
});

describe('finished room sync data', () => {
  it('reports rooms cancelled before play as match_cancelled', () => {
    expect(buildFinishedRoomSyncData({ winner: null, winner_reason: 'startup_unconfirmed' }, 'p1').outcome).toBe('match_cancelled');
    expect(buildFinishedRoomSyncData({ winner: null, winner_reason: 'startup_failed' }, 'p1').outcome).toBe('match_cancelled');
  });

  it('keeps the recorded reason for played matches', () => {
    expect(buildFinishedRoomSyncData({ winner: { toString: () => 'p1' }, winner_reason: 'forfeit' }, 'p1'))
      .toMatchObject({ outcome: 'forfeit', youWon: true, winner: 'p1' });
  });
});
