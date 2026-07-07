export declare class CreateGameDto {
    name: Record<string, string>;
    description: Record<string, string>;
    rules?: Array<Record<string, string>>;
    active: boolean;
    min_players: number;
    max_players: number;
    min_bet: number;
    default_bets: number[];
    house_edge: number;
    socket_code: string;
    turn_timer_seconds: number;
    uno_match_target?: number;
}
export declare class UpdateGameDto {
    name?: Record<string, string>;
    description?: Record<string, string>;
    rules?: Array<Record<string, string>>;
    active?: boolean;
    min_players?: number;
    max_players?: number;
    min_bet?: number;
    default_bets?: number[];
    house_edge?: number;
    socket_code?: string;
    turn_timer_seconds?: number;
    uno_match_target?: number;
}
