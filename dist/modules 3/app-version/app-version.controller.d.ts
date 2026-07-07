import { AppVersionStatsService, AppVersionStatsSummary } from './app-version-stats.service';
export declare class AppVersionController {
    private readonly stats;
    constructor(stats: AppVersionStatsService);
    getStats(days?: number): Promise<AppVersionStatsSummary>;
}
