export declare function bumpGameStateVersion(redis: {
    incr: (k: string) => Promise<number>;
    expire: (k: string, s: number) => Promise<unknown>;
}, game: string, roomId: string): Promise<number>;
export declare function computeTurnDeadlineAt(turnStart: Date | string | null | undefined, timerSeconds: number): string | null;
export declare function enrichGamePayload(redis: {
    incr: (k: string) => Promise<number>;
    expire: (k: string, s: number) => Promise<unknown>;
}, game: string, roomId: string, data: Record<string, unknown>, opts?: {
    turnStart?: Date | string | null;
    timerSeconds?: number;
}): Promise<Record<string, unknown>>;
