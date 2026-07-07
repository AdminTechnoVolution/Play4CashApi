import { ConfigService } from '@nestjs/config';
import { UserService } from './user.service';
import { I18nService } from '../../common/i18n/i18n.service';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
declare class RegisterWalletDto {
    coin: string;
    network: string;
    wallet: string;
}
declare class UpdateProfileDto {
    username?: string;
}
declare class RegisterUserDto {
    email: string;
    username: string;
    referred_by?: string;
}
declare class VerifyCodeDto {
    email: string;
    verification_code: string;
}
declare class ConfirmWalletOtpDto {
    verification_code: string;
}
declare class PushSubscriptionDto {
    endpoint: string;
    p256dh: string;
    auth: string;
}
declare class RemovePushSubscriptionDto {
    endpoint: string;
}
export declare class UserController {
    private readonly userService;
    private readonly i18n;
    private readonly config;
    constructor(userService: UserService, i18n: I18nService, config: ConfigService);
    getTotalBalances(): Promise<any>;
    getPublicStats(): Promise<{
        registeredUsers: number;
    }>;
    getAccount(user: JwtPayload): Promise<any>;
    getHistory(user: JwtPayload, lang: string): Promise<any[]>;
    register(dto: RegisterUserDto): Promise<void>;
    requestWalletChange(user: JwtPayload, dto: RegisterWalletDto, lang: string): Promise<{
        success: boolean;
        messages: string[];
        data: null;
    }>;
    confirmWalletChange(user: JwtPayload, dto: ConfirmWalletOtpDto, lang: string): Promise<{
        success: boolean;
        messages: string[];
        data: null;
    }>;
    verifyCode(dto: VerifyCodeDto): Promise<void>;
    updateProfile(user: JwtPayload, dto: UpdateProfileDto): Promise<any>;
    savePushSubscription(user: JwtPayload, dto: PushSubscriptionDto): Promise<{
        success: boolean;
        messages: never[];
        data: {
            saved: boolean;
        };
    }>;
    removePushSubscription(user: JwtPayload, dto: RemovePushSubscriptionDto): Promise<{
        success: boolean;
        messages: never[];
        data: {
            removed: boolean;
        };
    }>;
}
export {};
