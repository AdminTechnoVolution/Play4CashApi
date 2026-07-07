import { Model } from 'mongoose';
import { RechargeDocument } from './schemas/recharge.schema';
export declare class RechargeService {
    private readonly rechargeModel;
    private readonly userModel;
    private readonly txMessageModel;
    private readonly logger;
    constructor(rechargeModel: Model<RechargeDocument>, userModel: Model<any>, txMessageModel: Model<any>);
    createRecharge(userId: string, txId: string, coin: string, amount: number, processingExpiryMins: number): Promise<{
        balance: number;
    }>;
    getHistory(userId: string): Promise<RechargeDocument[]>;
    private saveTxMessage;
}
