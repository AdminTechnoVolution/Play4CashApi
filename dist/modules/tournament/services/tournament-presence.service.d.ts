export declare class TournamentPresenceService {
    private readonly redis;
    private readonly logger;
    constructor(redis: any);
    private key;
    markPresent(tournamentId: string, userId: string): Promise<void>;
    isPresent(tournamentId: string, userId: string): Promise<boolean>;
    clear(tournamentId: string, userId: string): Promise<void>;
}
