import { Model } from 'mongoose';
import { WalletEntry, WalletDocument } from './schemas/wallet.schema';
export declare class WalletService {
    private readonly walletModel;
    constructor(walletModel: Model<WalletDocument>);
    findAll(): Promise<WalletDocument[]>;
    create(data: Partial<WalletEntry>): Promise<WalletDocument>;
    update(id: string, data: Partial<WalletEntry>): Promise<WalletDocument>;
    delete(id: string): Promise<void>;
    findByCoinAndNetwork(coin: string, network: string): Promise<WalletDocument | null>;
}
