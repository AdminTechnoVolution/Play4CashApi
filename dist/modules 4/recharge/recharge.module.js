"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RechargeModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const recharge_controller_1 = require("./recharge.controller");
const recharge_service_1 = require("./recharge.service");
const recharge_schema_1 = require("./schemas/recharge.schema");
const user_schema_1 = require("../user/schemas/user.schema");
let RechargeModule = class RechargeModule {
};
exports.RechargeModule = RechargeModule;
exports.RechargeModule = RechargeModule = __decorate([
    (0, common_1.Module)({
        imports: [
            mongoose_1.MongooseModule.forFeature([
                { name: recharge_schema_1.Recharge.name, schema: recharge_schema_1.RechargeSchema },
                { name: user_schema_1.User.name, schema: user_schema_1.UserSchema },
                { name: 'TxMessage', schema: new (require('mongoose').Schema)({
                        user_id: { type: require('mongoose').Schema.Types.ObjectId },
                        txId: String, amount: Number, coin: String, message: String, txType: String,
                        created_at: { type: Date, default: Date.now },
                    }) },
            ]),
        ],
        controllers: [recharge_controller_1.RechargeController],
        providers: [recharge_service_1.RechargeService],
    })
], RechargeModule);
//# sourceMappingURL=recharge.module.js.map