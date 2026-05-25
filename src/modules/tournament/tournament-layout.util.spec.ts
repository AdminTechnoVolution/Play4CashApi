import { BadRequestException } from '@nestjs/common';
import {
  assertPowerOfTwoPlayerCount,
  isPowerOfTwo,
  resolveTournamentLayout,
} from './tournament-layout.util';
import { TOURNAMENT_GROUP_SIZE } from './constants/tournament.constants';

describe('resolveTournamentLayout', () => {
  it('derives groupCount as maxPlayers / 2', () => {
    expect(resolveTournamentLayout(4, 4)).toEqual({
      maxPlayers: 4,
      minPlayers: 4,
      groupSize: TOURNAMENT_GROUP_SIZE,
      groupCount: 2,
    });
    expect(resolveTournamentLayout(8, 4)).toEqual({
      maxPlayers: 8,
      minPlayers: 4,
      groupSize: TOURNAMENT_GROUP_SIZE,
      groupCount: 4,
    });
  });

  it('rejects non-power-of-two maxPlayers', () => {
    expect(() => resolveTournamentLayout(5, 4)).toThrow(BadRequestException);
    expect(() => resolveTournamentLayout(6, 4)).toThrow(BadRequestException);
    expect(() => resolveTournamentLayout(10, 4)).toThrow(BadRequestException);
  });

  it('rejects non-power-of-two minPlayers', () => {
    expect(() => resolveTournamentLayout(8, 3)).toThrow(BadRequestException);
    expect(() => resolveTournamentLayout(16, 6)).toThrow(BadRequestException);
  });

  it('rejects groupSize other than 2', () => {
    expect(() => resolveTournamentLayout(8, 4, 10)).toThrow(BadRequestException);
  });

  it('rejects mismatched explicit groupCount', () => {
    expect(() => resolveTournamentLayout(8, 4, 2, 3)).toThrow(BadRequestException);
  });

  it('accepts explicit groupCount when correct', () => {
    expect(resolveTournamentLayout(16, 4, 2, 8).groupCount).toBe(8);
  });
});

describe('isPowerOfTwo', () => {
  it('returns true for powers of 2 from 2 upward', () => {
    for (const n of [2, 4, 8, 16, 32, 64, 128, 256, 512]) {
      expect(isPowerOfTwo(n)).toBe(true);
    }
  });

  it('returns false for other counts', () => {
    for (const n of [0, 1, 3, 5, 6, 10, 12, 100, 1000]) {
      expect(isPowerOfTwo(n)).toBe(false);
    }
  });
});

describe('assertPowerOfTwoPlayerCount', () => {
  it('passes for powers of 2', () => {
    expect(() => assertPowerOfTwoPlayerCount(16, 'maxPlayers')).not.toThrow();
  });

  it('fails for even non-powers and odd numbers', () => {
    expect(() => assertPowerOfTwoPlayerCount(12, 'maxPlayers')).toThrow(BadRequestException);
    expect(() => assertPowerOfTwoPlayerCount(7, 'maxPlayers')).toThrow(BadRequestException);
  });
});
