import { ConfigService } from '@nestjs/config';
import type { RedisClientType } from 'redis';
export interface DailyVersionBucket {
    date: string;
    versions: Record<string, number>;
    staleVersions: Record<string, number>;
}
export interface AppVersionStatsSummary {
    daily: DailyVersionBucket[];
    totals: Record<string, number>;
    staleTotals: Record<string, number>;
    currentMinVersion: string | null;
    sampleRate: number;
    degraded: boolean;
}
export declare class AppVersionStatsService {
    private readonly redis;
    private readonly config;
    private readonly logger;
    constructor(redis: RedisClientType, config: ConfigService);
    getSampleRate(): number;
    getMinVersion(): string;
    record(version: string): Promise<void>;
    getStats(days: number): Promise<AppVersionStatsSummary>;
    private readHash;
}
