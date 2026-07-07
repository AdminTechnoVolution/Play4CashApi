import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { UserRepository } from './user.repository';
import { WalletService } from '../wallet/wallet.service';
import { EmailService } from '../../common/email/email.service';
import { WalletChangePendingDocument } from './schemas/wallet-change-pending.schema';
export declare class UserService {
    private readonly userRepo;
    private readonly appConfigModel;
    private readonly roomModel;
    private readonly walletChangePendingModel;
    private readonly walletService;
    private readonly emailService;
    private readonly config;
    private readonly logger;
    constructor(userRepo: UserRepository, appConfigModel: Model<any>, roomModel: Model<any>, walletChangePendingModel: Model<WalletChangePendingDocument>, walletService: WalletService, emailService: EmailService, config: ConfigService);
    getProfile(userId: string): Promise<any>;
    getHistory(userId: string, lang?: string): Promise<any[]>;
    registerUser(email: string, username: string, referred_by?: string): Promise<void>;
    verifyCode(email: string, verification_code: string): Promise<void>;
    requestWalletChange(userId: string, coin: string, network: string, wallet: string, expiryMins: number, lang?: string): Promise<void>;
    confirmWalletChangeWithOtp(userId: string, verification_code: string): Promise<void>;
    updateProfile(userId: string, update: {
        username?: string;
    }): Promise<any>;
    getTotalBalances(): Promise<any>;
    getPublicUserStats(): Promise<{
        registeredUsers: number;
    }>;
    savePushSubscription(userId: string, sub: {
        endpoint: string;
        keys: {
            p256dh: string;
            auth: string;
        };
    }): Promise<void>;
    removePushSubscription(userId: string, endpoint: string): Promise<void>;
}
