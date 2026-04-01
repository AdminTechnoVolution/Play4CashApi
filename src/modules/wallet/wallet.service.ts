import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WalletEntry, WalletDocument } from './schemas/wallet.schema';
import { BusinessException } from '../../common/exceptions/business.exception';

@Injectable()
export class WalletService {
  constructor(
    @InjectModel(WalletEntry.name) private readonly walletModel: Model<WalletDocument>,
  ) {}

  async findAll(): Promise<WalletDocument[]> {
    const wallets: any[] = await this.walletModel.find({ isActive: true }).lean();
    return wallets.map((w) => ({
      ...w,
      minAmount: Number(w.minAmount || 0),
      networkWithdrawalFee: Number(w.networkWithdrawalFee || 0),
    })) as any;
  }

  async create(data: Partial<WalletEntry>): Promise<WalletDocument> {
    return this.walletModel.create(data);
  }

  async update(id: string, data: Partial<WalletEntry>): Promise<WalletDocument> {
    const wallet = await this.walletModel.findByIdAndUpdate(id, data, { returnDocument: 'after' }).lean();
    if (!wallet) throw new BusinessException('ERROR_WALLET_NOT_FOUND', 404);
    return wallet as any;
  }

  async delete(id: string): Promise<void> {
    const result = await this.walletModel.findByIdAndDelete(id);
    if (!result) throw new BusinessException('ERROR_WALLET_NOT_FOUND', 404);
  }

  async findByCoinAndNetwork(coin: string, network: string): Promise<WalletDocument | null> {
    const wallet: any = await this.walletModel
      .findOne({
        coin: coin.toUpperCase(),
        red: network,
        isActive: true,
      })
      .lean();

    if (wallet) {
      wallet.minAmount = Number(wallet.minAmount || 0);
      wallet.networkWithdrawalFee = Number(wallet.networkWithdrawalFee || 0);
    }
    return wallet;
  }
}
