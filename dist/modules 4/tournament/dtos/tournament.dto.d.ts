export declare class CreateTournamentDto {
    title: Record<string, string>;
    description?: Record<string, string>;
    gameId: string;
    buyIn: number;
    maxPlayers: number;
    minPlayers: number;
    groupSize?: number;
    groupCount?: number;
    startsAt: string;
    registrationOpensAt?: string;
    registrationClosesAt?: string;
    turnTimerSeconds?: number;
    betweenRoundsPauseSeconds?: number;
    presenceWindowSeconds?: number;
    rematchDelaySeconds?: number;
    houseFeePercent?: number;
    firstPlacePercent?: number;
    secondPlacePercent?: number;
    bracketSeed?: string;
}
export declare class UpdateTournamentDto {
    title?: Record<string, string>;
    description?: Record<string, string>;
    gameId?: string;
    buyIn?: number;
    maxPlayers?: number;
    minPlayers?: number;
    groupCount?: number;
    groupSize?: number;
    startsAt?: string;
    registrationOpensAt?: string;
    registrationClosesAt?: string;
    turnTimerSeconds?: number;
    betweenRoundsPauseSeconds?: number;
    presenceWindowSeconds?: number;
    rematchDelaySeconds?: number;
    houseFeePercent?: number;
    firstPlacePercent?: number;
    secondPlacePercent?: number;
    bracketSeed?: string;
}
