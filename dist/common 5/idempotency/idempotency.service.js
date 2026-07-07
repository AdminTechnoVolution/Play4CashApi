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
var IdempotencyService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.IdempotencyService = void 0;
const common_1 = require("@nestjs/common");
const redis_module_1 = require("../redis/redis.module");
let IdempotencyService = class IdempotencyService {
    static { IdempotencyService_1 = this; }
    redis;
    logger = new common_1.Logger(IdempotencyService_1.name);
    static DEFAULT_TTL_SEC = 300;
    constructor(redis) {
        this.redis = redis;
    }
    async getOrSet(key, ttlSec, producer) {
        try {
            const cached = await this.redis.get(key);
            if (cached) {
                this.logger.log(`event=idempotency_hit key=${key}`);
                return JSON.parse(cached);
            }
        }
        catch (e) {
            this.logger.warn(`[Idempotency] read failed key=${key}: ${e?.message}`);
        }
        const result = await producer();
        try {
            await this.redis.set(key, JSON.stringify(result), 'EX', ttlSec);
        }
        catch (e) {
            this.logger.warn(`[Idempotency] write failed key=${key}: ${e?.message}`);
        }
        return result;
    }
};
exports.IdempotencyService = IdempotencyService;
exports.IdempotencyService = IdempotencyService = IdempotencyService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(redis_module_1.REDIS_CLIENT)),
    __metadata("design:paramtypes", [Object])
], IdempotencyService);
//# sourceMappingURL=idempotency.service.js.map