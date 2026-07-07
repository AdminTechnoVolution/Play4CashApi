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
var GreetingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GreetingService = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const greeting_schema_1 = require("./schemas/greeting.schema");
const business_exception_1 = require("../../common/exceptions/business.exception");
let GreetingService = GreetingService_1 = class GreetingService {
    greetingModel;
    logger = new common_1.Logger(GreetingService_1.name);
    constructor(greetingModel) {
        this.greetingModel = greetingModel;
    }
    async getRandom(lang = 'en') {
        const supported = ['es', 'en', 'fr', 'de', 'it', 'pt'];
        const l = supported.includes(lang) ? lang : 'en';
        const greetings = await this.greetingModel.aggregate([
            { $match: { active: true } },
            { $sample: { size: 5 } },
            { $project: { _id: 1, text: `$text.${l}`, active: 1, createdAt: 1 } },
        ]);
        return { success: true, messages: [], data: greetings };
    }
    async create(dto) {
        const greeting = await this.greetingModel.create({ text: dto.text });
        return { success: true, messages: [], data: greeting };
    }
    async update(id, dto) {
        const greeting = await this.greetingModel.findByIdAndUpdate(id, { $set: dto }, { new: true });
        if (!greeting)
            throw new business_exception_1.BusinessException('ERROR_NOT_FOUND', 404);
        return { success: true, messages: [], data: greeting };
    }
    async getAll() {
        const greetings = await this.greetingModel.find().sort({ createdAt: -1 }).lean();
        return { success: true, messages: [], data: greetings };
    }
    async delete(id) {
        const result = await this.greetingModel.findByIdAndDelete(id);
        if (!result)
            throw new business_exception_1.BusinessException('ERROR_NOT_FOUND', 404);
        return { success: true, messages: [], data: { deleted: true } };
    }
};
exports.GreetingService = GreetingService;
exports.GreetingService = GreetingService = GreetingService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(greeting_schema_1.Greeting.name)),
    __metadata("design:paramtypes", [mongoose_2.Model])
], GreetingService);
//# sourceMappingURL=greeting.service.js.map