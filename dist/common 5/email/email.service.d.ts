import { ConfigService } from '@nestjs/config';
export declare class EmailService {
    private readonly config;
    private readonly logger;
    private transporter;
    constructor(config: ConfigService);
    sendEmail(to: string, subject: string, html: string): Promise<void>;
    sendWithdrawalVerification(to: string, username: string, code: string, expiryMins: number, lang?: string): Promise<void>;
    sendWalletChangeVerification(to: string, username: string, code: string, expiryMins: number, lang?: string): Promise<void>;
}
