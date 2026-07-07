import { AppConfigService } from './app-config.service';
export declare class AppConfigController {
    private readonly appConfigService;
    constructor(appConfigService: AppConfigService);
    getConfig(): Promise<{
        withdrawal_daily_limit: number;
    }>;
    updateConfig(body: any): Promise<{
        withdrawal_daily_limit: number;
    }>;
}
