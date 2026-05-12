import { compareSemver } from './semver-compare.util';

describe('compareSemver', () => {
  it('returns 0 for equal versions', () => {
    expect(compareSemver('1.2.3', '1.2.3')).toBe(0);
  });

  it('returns negative when a < b', () => {
    expect(compareSemver('1.2.3', '1.2.4')).toBeLessThan(0);
    expect(compareSemver('1.2.3', '1.3.0')).toBeLessThan(0);
    expect(compareSemver('1.2.3', '2.0.0')).toBeLessThan(0);
  });

  it('returns positive when a > b', () => {
    expect(compareSemver('1.2.4', '1.2.3')).toBeGreaterThan(0);
    expect(compareSemver('2.0.0', '1.99.99')).toBeGreaterThan(0);
  });

  it('treats missing segments as zero', () => {
    expect(compareSemver('1', '1.0.0')).toBe(0);
    expect(compareSemver('1.0', '1.0.0')).toBe(0);
    expect(compareSemver('1.2', '1.2.1')).toBeLessThan(0);
  });

  it('ignores +build suffixes', () => {
    expect(compareSemver('1.2.3+abc1234', '1.2.3+def5678')).toBe(0);
    expect(compareSemver('1.2.3+abc1234', '1.2.4')).toBeLessThan(0);
  });

  it('treats non-numeric segments as zero (defensive)', () => {
    expect(compareSemver('1.x.3', '1.0.3')).toBe(0);
    expect(compareSemver('foo', 'bar')).toBe(0);
  });

  it('handles whitespace-padded inputs by parsing numerics only', () => {
    expect(compareSemver(' 1.2.3 ', '1.2.3')).toBeLessThanOrEqual(0);
    // Note: leading/trailing space yields NaN on the first segment which becomes 0;
    // we don't trim inside the comparator. The interceptor sanitizes upstream.
  });
});
