import { BadRequestException } from '@nestjs/common';
import {
  assertEvenPlayerCount,
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

  it('rejects odd maxPlayers', () => {
    expect(() => resolveTournamentLayout(5, 4)).toThrow(BadRequestException);
  });

  it('rejects odd minPlayers', () => {
    expect(() => resolveTournamentLayout(8, 3)).toThrow(BadRequestException);
  });

  it('rejects groupSize other than 2', () => {
    expect(() => resolveTournamentLayout(8, 4, 10)).toThrow(BadRequestException);
  });

  it('rejects mismatched explicit groupCount', () => {
    expect(() => resolveTournamentLayout(8, 4, 2, 3)).toThrow(BadRequestException);
  });

  it('accepts explicit groupCount when correct', () => {
    expect(resolveTournamentLayout(10, 4, 2, 5).groupCount).toBe(5);
  });
});

describe('assertEvenPlayerCount', () => {
  it('passes for even numbers', () => {
    expect(() => assertEvenPlayerCount(12, 'maxPlayers')).not.toThrow();
  });

  it('fails for odd numbers', () => {
    expect(() => assertEvenPlayerCount(7, 'maxPlayers')).toThrow(BadRequestException);
  });
});
