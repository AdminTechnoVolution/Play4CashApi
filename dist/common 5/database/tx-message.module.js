"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TxMessageModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const TxMessageSchema = new mongoose_2.Schema({
    user_id: { type: mongoose_2.Types.ObjectId, ref: 'User' },
    txId: String,
    amount: Number,
    coin: String,
    message: String,
    txType: { type: String, enum: ['recharge', 'withdrawal'], default: 'recharge' },
    created_at: { type: Date, default: Date.now },
});
let TxMessageModule = class TxMessageModule {
};
exports.TxMessageModule = TxMessageModule;
exports.TxMessageModule = TxMessageModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [mongoose_1.MongooseModule.forFeature([{ name: 'TxMessage', schema: TxMessageSchema }])],
        exports: [mongoose_1.MongooseModule],
    })
], TxMessageModule);
//# sourceMappingURL=tx-message.module.js.map