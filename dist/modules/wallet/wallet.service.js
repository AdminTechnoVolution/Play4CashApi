"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WalletService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const wallet_schema_1 = require("./schemas/wallet.schema");
const business_exception_1 = require("../../common/exceptions/business.exception");
let WalletService = class WalletService {
    walletModel;
    constructor(walletModel) {
        this.walletModel = walletModel;
    }
    async findAll() {
        const wallets = await this.walletModel.find({ isActive: true }).lean();
        return wallets.map((w) => ({
            ...w,
            minAmount: Number(w.minAmount || 0),
            networkWithdrawalFee: Number(w.networkWithdrawalFee || 0),
        }));
    }
    async create(data) {
        return this.walletModel.create(data);
    }
    async update(id, data) {
        const wallet = await this.walletModel.findByIdAndUpdate(id, data, { returnDocument: 'after' }).lean();
        if (!wallet)
            throw new business_exception_1.BusinessException('ERROR_WALLET_NOT_FOUND', 404);
        return wallet;
    }
    async delete(id) {
        const result = await this.walletModel.findByIdAndDelete(id);
        if (!result)
            throw new business_exception_1.BusinessException('ERROR_WALLET_NOT_FOUND', 404);
    }
    async findByCoinAndNetwork(coin, network) {
        const wallet = await this.walletModel
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
};
exports.WalletService = WalletService;
exports.WalletService = WalletService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(wallet_schema_1.WalletEntry.name)),
    __metadata("design:paramtypes", [mongoose_2.Model])
], WalletService);
//# sourceMappingURL=wallet.service.js.map