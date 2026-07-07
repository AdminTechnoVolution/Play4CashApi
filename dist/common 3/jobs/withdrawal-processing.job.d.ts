import { Model } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { I18nService } from '../i18n/i18n.service';
export declare class WithdrawalProcessingJob {
    private readonly withdrawalModel;
    private readonly userModel;
    private readonly txMessageModel;
    private readonly config;
    private readonly i18n;
    private readonly redis;
    private readonly logger;
    constructor(withdrawalModel: Model<any>, userModel: Model<any>, txMessageModel: Model<any>, config: ConfigService, i18n: I18nService, redis: any);
    handleCron(): Promise<void>;
    private processWithdrawals;
    private confirmWithdrawal;
    private rejectWithdrawal;
    private logOtherStatus;
}
