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
exports.UserRepository = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const user_schema_1 = require("./schemas/user.schema");
let UserRepository = class UserRepository {
    userModel;
    constructor(userModel) {
        this.userModel = userModel;
    }
    async findByEmail(email) {
        return this.userModel.findOne({ email }).lean();
    }
    async findById(id) {
        return this.userModel.findById(id).lean();
    }
    async findByIdSelect(id, select) {
        return this.userModel.findById(id).select(select).lean();
    }
    async findByUsername(username) {
        return this.userModel
            .findOne({ username })
            .collation({ locale: 'en', strength: 2 })
            .lean();
    }
    async create(data) {
        return this.userModel.create(data);
    }
    async updateById(id, update) {
        return this.userModel.findByIdAndUpdate(id, update, { returnDocument: 'after' }).lean();
    }
    async countRegisteredUsers() {
        return this.userModel.countDocuments().exec();
    }
    async upsertPushSubscription(userId, sub) {
        await this.userModel.updateOne({ _id: userId }, { $pull: { push_subscriptions: { endpoint: sub.endpoint } } });
        await this.userModel.updateOne({ _id: userId }, { $push: { push_subscriptions: sub } });
    }
    async removePushSubscription(userId, endpoint) {
        await this.userModel.updateOne({ _id: userId }, { $pull: { push_subscriptions: { endpoint } } });
    }
    async getTotalBalances() {
        const result = await this.userModel.aggregate([
            {
                $group: {
                    _id: null,
                    total_balances: { $sum: '$balance' },
                    total_deposited: { $sum: '$total_recharged' },
                    total_withdrawn: { $sum: '$total_witdrawal' },
                    total_users: { $sum: 1 },
                },
            },
        ]);
        const data = result.length > 0 ? result[0] : { total_balances: 0, total_deposited: 0, total_withdrawn: 0, total_users: 0 };
        delete data._id;
        return data;
    }
};
exports.UserRepository = UserRepository;
exports.UserRepository = UserRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(user_schema_1.User.name)),
    __metadata("design:paramtypes", [mongoose_2.Model])
], UserRepository);
//# sourceMappingURL=user.repository.js.map