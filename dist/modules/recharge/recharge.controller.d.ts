import { RechargeService } from './recharge.service';
import { I18nService } from '../../common/i18n/i18n.service';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
import { ConfigService } from '@nestjs/config';
declare class CreateRechargeDto {
    txId: string;
    coin: string;
    amount: number;
}
export declare class RechargeController {
    private readonly rechargeService;
    private readonly config;
    private readonly i18n;
    constructor(rechargeService: RechargeService, config: ConfigService, i18n: I18nService);
    create(user: JwtPayload, dto: CreateRechargeDto, lang: string): Promise<{
        success: boolean;
        messages: string[];
        data: {
            balance: number;
        };
    }>;
    getHistory(user: JwtPayload): Promise<import("./schemas/recharge.schema").RechargeDocument[]>;
}
export {};
