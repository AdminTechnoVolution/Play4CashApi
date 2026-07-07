import { Model } from 'mongoose';
import { AppConfigDocument } from './schemas/app-config.schema';
export declare class AppConfigService {
    private readonly configModel;
    constructor(configModel: Model<AppConfigDocument>);
    getRawConfig(): Promise<any>;
    getConfig(): Promise<{
        withdrawal_daily_limit: number;
    }>;
    updateConfig(data: {
        withdrawal_daily_limit?: number;
    }): Promise<{
        withdrawal_daily_limit: number;
    }>;
}
