import { BadRequestException } from '@nestjs/common';
import {
  TOURNAMENT_GROUP_SIZE,
  TOURNAMENT_MAX_PLAYERS,
  TOURNAMENT_MIN_PLAYERS,
} from './constants/tournament.constants';

export { TOURNAMENT_GROUP_SIZE, TOURNAMENT_MIN_PLAYERS, TOURNAMENT_MAX_PLAYERS };

export interface TournamentLayout {
  maxPlayers: number;
  minPlayers: number;
  groupSize: number;
  groupCount: number;
}

export function isPowerOfTwo(value: number): boolean {
  return Number.isInteger(value) && value >= 2 && (value & (value - 1)) === 0;
}

export function assertPowerOfTwoPlayerCount(value: number, field: string): void {
  if (!isPowerOfTwo(value)) {
    throw new BadRequestException(
      `${field} must be a power of 2 (e.g. 2, 4, 8, 16, 32…) for bracket sizing`,
    );
  }
}

/**
 * Validates tournament capacity and derives groupCount = maxPlayers / 2.
 * groupSize is fixed at 2; an explicit groupCount must match the derived value.
 */
export function resolveTournamentLayout(
  maxPlayers: number,
  minPlayers: number,
  groupSize?: number,
  groupCount?: number,
): TournamentLayout {
  if (maxPlayers < TOURNAMENT_MIN_PLAYERS || maxPlayers > TOURNAMENT_MAX_PLAYERS) {
    throw new BadRequestException(
      `maxPlayers must be between ${TOURNAMENT_MIN_PLAYERS} and ${TOURNAMENT_MAX_PLAYERS}`,
    );
  }
  assertPowerOfTwoPlayerCount(maxPlayers, 'maxPlayers');
  assertPowerOfTwoPlayerCount(minPlayers, 'minPlayers');

  if (minPlayers < TOURNAMENT_MIN_PLAYERS) {
    throw new BadRequestException(`minPlayers must be at least ${TOURNAMENT_MIN_PLAYERS}`);
  }
  if (minPlayers > maxPlayers) {
    throw new BadRequestException('minPlayers cannot exceed maxPlayers');
  }

  const size = groupSize ?? TOURNAMENT_GROUP_SIZE;
  if (size !== TOURNAMENT_GROUP_SIZE) {
    throw new BadRequestException(`groupSize must be ${TOURNAMENT_GROUP_SIZE}`);
  }

  const derivedGroupCount = maxPlayers / TOURNAMENT_GROUP_SIZE;
  const count = groupCount ?? derivedGroupCount;
  if (count !== derivedGroupCount) {
    throw new BadRequestException(
      `groupCount must be maxPlayers / ${TOURNAMENT_GROUP_SIZE} (${derivedGroupCount} for ${maxPlayers} players)`,
    );
  }
  if (count * size !== maxPlayers) {
    throw new BadRequestException('groupCount × groupSize must equal maxPlayers');
  }

  return { maxPlayers, minPlayers, groupSize: size, groupCount: count };
}
