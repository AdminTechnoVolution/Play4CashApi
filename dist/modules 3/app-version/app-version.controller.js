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
exports.AppVersionController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const throttler_1 = require("@nestjs/throttler");
const app_version_stats_service_1 = require("./app-version-stats.service");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const roles_guard_1 = require("../../common/guards/roles.guard");
let AppVersionController = class AppVersionController {
    stats;
    constructor(stats) {
        this.stats = stats;
    }
    async getStats(days) {
        const summary = await this.stats.getStats(days ?? 7);
        if (summary.degraded && summary.daily.every((d) => Object.keys(d.versions).length === 0)) {
            throw new common_1.HttpException({ message: 'Stats backend unavailable', summary }, common_1.HttpStatus.SERVICE_UNAVAILABLE);
        }
        return summary;
    }
};
exports.AppVersionController = AppVersionController;
__decorate([
    (0, common_1.Get)('stats'),
    (0, throttler_1.Throttle)({ default: { ttl: 60_000, limit: 30 } }),
    (0, swagger_1.ApiOperation)({
        summary: 'Distribution of `X-App-Version` headers across the last N days (sampled).',
    }),
    (0, swagger_1.ApiQuery)({ name: 'days', required: false, type: Number, description: '1..60 (default 7)' }),
    __param(0, (0, common_1.Query)('days', new common_1.ParseIntPipe({ optional: true }))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], AppVersionController.prototype, "getStats", null);
exports.AppVersionController = AppVersionController = __decorate([
    (0, swagger_1.ApiTags)('Admin · App Version'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('admin/app-versions'),
    (0, common_1.UseGuards)(roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('admin'),
    __metadata("design:paramtypes", [app_version_stats_service_1.AppVersionStatsService])
], AppVersionController);
//# sourceMappingURL=app-version.controller.js.map