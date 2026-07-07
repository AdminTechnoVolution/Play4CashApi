export declare class IdempotencyService {
    private readonly redis;
    private readonly logger;
    static readonly DEFAULT_TTL_SEC = 300;
    constructor(redis: any);
    getOrSet<T>(key: string, ttlSec: number, producer: () => Promise<T>): Promise<T>;
}
