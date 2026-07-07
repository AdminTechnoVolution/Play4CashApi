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
var AppVersionStatsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppVersionStatsService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const redis_module_1 = require("../../common/redis/redis.module");
const redis_keys_constants_1 = require("../../common/constants/redis-keys.constants");
const semver_compare_util_1 = require("./semver-compare.util");
const MAX_VERSION_STRING_LEN = 32;
let AppVersionStatsService = AppVersionStatsService_1 = class AppVersionStatsService {
    redis;
    config;
    logger = new common_1.Logger(AppVersionStatsService_1.name);
    constructor(redis, config) {
        this.redis = redis;
        this.config = config;
    }
    getSampleRate() {
        return this.config.get('pwa.statsSampleRate') ?? 0.1;
    }
    getMinVersion() {
        return this.config.get('pwa.minVersion') || '';
    }
    async record(version) {
        const sanitized = sanitizeVersion(version);
        if (!sanitized)
            return;
        const dayKey = todayKey();
        const ttlSecs = (this.config.get('pwa.statsRetentionDays') ?? 31) * 86400;
        const minVersion = this.getMinVersion();
        const isStale = !!minVersion && (0, semver_compare_util_1.compareSemver)(sanitized, minVersion) < 0;
        try {
            const dailyKey = redis_keys_constants_1.REDIS_KEY_APP_VERSION_DAILY + dayKey;
            await this.redis.hIncrBy(dailyKey, sanitized, 1);
            await this.redis.expire(dailyKey, ttlSecs);
            if (isStale) {
                const staleKey = redis_keys_constants_1.REDIS_KEY_APP_VERSION_STALE + dayKey;
                await this.redis.hIncrBy(staleKey, sanitized, 1);
                await this.redis.expire(staleKey, ttlSecs);
            }
        }
        catch (err) {
            this.logger.debug(`record() failed: ${err.message}`);
        }
    }
    async getStats(days) {
        const window = clampWindow(days);
        const dates = lastNDates(window);
        const daily = [];
        const totals = {};
        const staleTotals = {};
        let degraded = false;
        for (const date of dates) {
            const versionsResult = await this.readHash(redis_keys_constants_1.REDIS_KEY_APP_VERSION_DAILY + date);
            const staleResult = await this.readHash(redis_keys_constants_1.REDIS_KEY_APP_VERSION_STALE + date);
            if (!versionsResult.ok || !staleResult.ok)
                degraded = true;
            const versions = versionsResult.data;
            const staleVersions = staleResult.data;
            daily.push({ date, versions, staleVersions });
            for (const [v, count] of Object.entries(versions)) {
                totals[v] = (totals[v] ?? 0) + count;
            }
            for (const [v, count] of Object.entries(staleVersions)) {
                staleTotals[v] = (staleTotals[v] ?? 0) + count;
            }
        }
        return {
            daily,
            totals,
            staleTotals,
            currentMinVersion: this.getMinVersion() || null,
            sampleRate: this.getSampleRate(),
            degraded,
        };
    }
    async readHash(key) {
        try {
            const raw = await this.redis.hGetAll(key);
            const out = {};
            for (const [k, v] of Object.entries(raw)) {
                const n = parseInt(v, 10);
                if (Number.isFinite(n))
                    out[k] = n;
            }
            return { ok: true, data: out };
        }
        catch (err) {
            this.logger.debug(`readHash(${key}) failed: ${err.message}`);
            return { ok: false, data: {} };
        }
    }
};
exports.AppVersionStatsService = AppVersionStatsService;
exports.AppVersionStatsService = AppVersionStatsService = AppVersionStatsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(redis_module_1.REDIS_CLIENT)),
    __metadata("design:paramtypes", [Object, config_1.ConfigService])
], AppVersionStatsService);
function sanitizeVersion(input) {
    if (typeof input !== 'string')
        return null;
    const trimmed = input.trim().slice(0, MAX_VERSION_STRING_LEN);
    if (!trimmed)
        return null;
    if (!/^[\w.+\-]+$/.test(trimmed))
        return null;
    return trimmed;
}
function todayKey() {
    return new Date().toISOString().slice(0, 10);
}
function lastNDates(n) {
    const out = [];
    const today = new Date();
    for (let i = n - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setUTCDate(today.getUTCDate() - i);
        out.push(d.toISOString().slice(0, 10));
    }
    return out;
}
function clampWindow(days) {
    if (!Number.isFinite(days))
        return 7;
    return Math.min(60, Math.max(1, Math.floor(days)));
}
//# sourceMappingURL=app-version-stats.service.js.map