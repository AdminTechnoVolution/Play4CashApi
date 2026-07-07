import { Model } from 'mongoose';
import { WithdrawalDocument } from './schemas/withdrawal.schema';
import { WalletService } from '../wallet/wallet.service';
import { AppConfigService } from '../app-config/app-config.service';
import { EmailService } from '../../common/email/email.service';
export declare class WithdrawalService {
    private readonly withdrawalModel;
    private readonly userModel;
    private readonly txMessageModel;
    private readonly walletService;
    private readonly appConfigService;
    private readonly emailService;
    private readonly logger;
    constructor(withdrawalModel: Model<WithdrawalDocument>, userModel: Model<any>, txMessageModel: Model<any>, walletService: WalletService, appConfigService: AppConfigService, emailService: EmailService);
    processWithdrawal(userId: string, verification_code: string): Promise<{
        balance: number;
    }>;
    initiateWithdrawal(userId: string, amount: number, verificationExpiryMins: number, lang?: string): Promise<void>;
    private saveTxMessage;
    getHistory(userId: string): Promise<any[]>;
}
