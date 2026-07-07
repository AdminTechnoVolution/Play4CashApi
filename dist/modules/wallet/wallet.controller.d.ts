import { WalletService } from './wallet.service';
export declare class WalletController {
    private readonly walletService;
    constructor(walletService: WalletService);
    findAll(): Promise<import("./schemas/wallet.schema").WalletDocument[]>;
    create(body: any): Promise<import("./schemas/wallet.schema").WalletDocument>;
    update(id: string, body: any): Promise<import("./schemas/wallet.schema").WalletDocument>;
    remove(id: string): Promise<{
        success: boolean;
        messages: string[];
        data: null;
    }>;
}
