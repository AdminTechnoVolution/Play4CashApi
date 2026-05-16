import {
  clampUnoMatchTarget,
  resolveUnoMatchTarget,
  UNO_MATCH_TARGET_DEFAULT,
  UNO_MATCH_TARGET_MAX,
  UNO_MATCH_TARGET_MIN,
} from './uno-game.constants';

describe('clampUnoMatchTarget', () => {
  it('clamps to [50, 500]', () => {
    expect(clampUnoMatchTarget(49)).toBe(UNO_MATCH_TARGET_MIN);
    expect(clampUnoMatchTarget(501)).toBe(UNO_MATCH_TARGET_MAX);
    expect(clampUnoMatchTarget(200)).toBe(200);
  });
});

describe('resolveUnoMatchTarget', () => {
  it('prefers catalog when set', () => {
    expect(resolveUnoMatchTarget(300, '100')).toBe(300);
  });

  it('uses env when catalog is absent', () => {
    expect(resolveUnoMatchTarget(undefined, '350')).toBe(350);
    expect(resolveUnoMatchTarget(null, '350')).toBe(350);
  });

  it('defaults when catalog and env are unusable', () => {
    expect(resolveUnoMatchTarget(undefined, undefined)).toBe(UNO_MATCH_TARGET_DEFAULT);
    expect(resolveUnoMatchTarget(undefined, 'not-a-number')).toBe(UNO_MATCH_TARGET_DEFAULT);
  });

  it('clamps catalog and env', () => {
    expect(resolveUnoMatchTarget(600, undefined)).toBe(UNO_MATCH_TARGET_MAX);
    expect(resolveUnoMatchTarget(undefined, '900')).toBe(UNO_MATCH_TARGET_MAX);
    expect(resolveUnoMatchTarget(30, undefined)).toBe(UNO_MATCH_TARGET_MIN);
  });
});
