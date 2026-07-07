import { TOURNAMENT_GROUP_SIZE, TOURNAMENT_MAX_PLAYERS, TOURNAMENT_MIN_PLAYERS } from './constants/tournament.constants';
export { TOURNAMENT_GROUP_SIZE, TOURNAMENT_MIN_PLAYERS, TOURNAMENT_MAX_PLAYERS };
export interface TournamentLayout {
    maxPlayers: number;
    minPlayers: number;
    groupSize: number;
    groupCount: number;
}
export declare function isPowerOfTwo(value: number): boolean;
export declare function assertPowerOfTwoPlayerCount(value: number, field: string): void;
export declare function resolveTournamentLayout(maxPlayers: number, minPlayers: number, groupSize?: number, groupCount?: number): TournamentLayout;
