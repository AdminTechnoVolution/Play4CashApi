import { WithdrawalService } from './withdrawal.service';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
import { ConfigService } from '@nestjs/config';
import { I18nService } from '../../common/i18n/i18n.service';
declare class InitiateWithdrawalDto {
    amount: number;
}
declare class VerifyWithdrawalDto {
    verification_code: string;
}
export declare class WithdrawalController {
    private readonly withdrawalService;
    private readonly config;
    private readonly i18n;
    constructor(withdrawalService: WithdrawalService, config: ConfigService, i18n: I18nService);
    initiate(user: JwtPayload, dto: InitiateWithdrawalDto, lang: string): Promise<{
        success: boolean;
        messages: string[];
        data: null;
    }>;
    verify(user: JwtPayload, dto: VerifyWithdrawalDto, lang: string): Promise<{
        success: boolean;
        messages: string[];
        data: {
            balance: number;
        };
    }>;
    getHistory(user: JwtPayload): Promise<any[]>;
}
export {};
