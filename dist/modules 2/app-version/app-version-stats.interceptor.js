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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppVersionStatsInterceptor = void 0;
const common_1 = require("@nestjs/common");
const app_version_stats_service_1 = require("./app-version-stats.service");
let AppVersionStatsInterceptor = class AppVersionStatsInterceptor {
    stats;
    constructor(stats) {
        this.stats = stats;
    }
    intercept(context, next) {
        if (context.getType() === 'http') {
            const sampleRate = this.stats.getSampleRate();
            if (sampleRate > 0 && Math.random() < sampleRate) {
                const req = context.switchToHttp().getRequest();
                const version = req?.clientAppVersion;
                if (version) {
                    this.stats.record(version).catch(() => {
                    });
                }
            }
        }
        return next.handle();
    }
};
exports.AppVersionStatsInterceptor = AppVersionStatsInterceptor;
exports.AppVersionStatsInterceptor = AppVersionStatsInterceptor = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [app_version_stats_service_1.AppVersionStatsService])
], AppVersionStatsInterceptor);
//# sourceMappingURL=app-version-stats.interceptor.js.map