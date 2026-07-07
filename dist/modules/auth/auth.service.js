"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var AuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const google_auth_library_1 = require("google-auth-library");
const jwt = __importStar(require("jsonwebtoken"));
const crypto_1 = require("crypto");
const redis_module_1 = require("../../common/redis/redis.module");
const redis_keys_constants_1 = require("../../common/constants/redis-keys.constants");
const business_exception_1 = require("../../common/exceptions/business.exception");
const user_repository_1 = require("../user/user.repository");
const user_schema_1 = require("../user/schemas/user.schema");
const jwt_token_util_1 = require("../../common/auth/jwt-token.util");
let AuthService = AuthService_1 = class AuthService {
    config;
    userRepo;
    redis;
    logger = new common_1.Logger(AuthService_1.name);
    googleClient;
    constructor(config, userRepo, redis) {
        this.config = config;
        this.userRepo = userRepo;
        this.redis = redis;
        this.googleClient = new google_auth_library_1.OAuth2Client(config.get('google.clientId'));
    }
    async loginUser(googleToken) {
        let googlePayload;
        try {
            const ticket = await this.googleClient.verifyIdToken({
                idToken: googleToken,
                audience: this.config.get('google.clientId'),
            });
            googlePayload = ticket.getPayload();
        }
        catch {
            throw new business_exception_1.BusinessException('ERROR_LOGIN', 401);
        }
        let { email, name } = googlePayload;
        email = email.toLowerCase();
        let user = await this.userRepo.findByEmail(email);
        if (!user) {
            const base = (name || 'user').replace(/\s+/g, '_').toLowerCase().slice(0, 20) || 'user';
            let username = base;
            for (let i = 0; i < 25; i++) {
                const taken = await this.userRepo.findByUsername(username);
                if (!taken)
                    break;
                const suffix = String(Math.floor(Math.random() * 10000));
                const prefix = base.slice(0, Math.max(1, 20 - suffix.length));
                username = (prefix + suffix).slice(0, 20);
            }
            if (await this.userRepo.findByUsername(username)) {
                username = `u${Date.now()}`.slice(-20);
            }
            user = await this.userRepo.create({ email, username, status: 'active' });
        }
        if (user.status !== 'active') {
            throw new business_exception_1.BusinessException('ERROR_LOGIN', 401);
        }
        const role = this.resolveRole(user.role, email);
        const familyId = (0, crypto_1.randomUUID)();
        const userId = String(user._id);
        const accessPayload = { id: userId, email: user.email, username: user.username, name, role, familyId };
        const { token: accessToken, jti: accessJti } = await this.issueAccessToken(accessPayload);
        const { token: refreshToken, jti: refreshJti } = await this.issueRefreshToken(accessPayload);
        await this.persistFamily(familyId, userId, refreshJti, refreshToken, accessToken);
        this.logger.log(`[AuthService] Login OK userId=${userId} family=${familyId}`);
        return { success: true, messages: [], data: { token: accessToken, refreshToken } };
    }
    async refreshToken(currentRefreshToken) {
        const secret = this.config.get('jwt.secret');
        let payload;
        try {
            payload = jwt.verify(currentRefreshToken, secret, (0, jwt_token_util_1.jwtVerifyOptions)(this.config));
        }
        catch {
            throw new business_exception_1.BusinessException('ERROR_AUTH', 401);
        }
        if (!(0, jwt_token_util_1.isRefreshTokenPayload)(payload) || !payload.familyId || !payload.jti) {
            throw new business_exception_1.BusinessException('ERROR_AUTH', 401);
        }
        const familyId = String(payload.familyId);
        const presentedJti = String(payload.jti);
        const familyKey = `${redis_keys_constants_1.REDIS_KEY_SESSION_FAMILY}${familyId}`;
        const familyRaw = await this.redis.get(familyKey);
        if (!familyRaw) {
            throw new business_exception_1.BusinessException('ERROR_AUTH', 401);
        }
        let family;
        try {
            family = JSON.parse(familyRaw);
        }
        catch {
            await this.revokeFamily(familyId);
            throw new business_exception_1.BusinessException('ERROR_AUTH', 401);
        }
        if (family.currentJti !== presentedJti) {
            this.logger.warn(`[AuthService] Refresh reuse detected family=${familyId} → revoking session`);
            await this.revokeFamily(familyId);
            throw new business_exception_1.BusinessException('ERROR_AUTH', 401);
        }
        const inAllowlist = await this.redis.exists(`${redis_keys_constants_1.REDIS_KEY_REFRESH_TOKEN}${currentRefreshToken}`);
        if (inAllowlist !== 1) {
            this.logger.warn(`[AuthService] Refresh jti matches family but token missing in allowlist → revoke family=${familyId}`);
            await this.revokeFamily(familyId);
            throw new business_exception_1.BusinessException('ERROR_AUTH', 401);
        }
        await this.redis.del(`${redis_keys_constants_1.REDIS_KEY_REFRESH_TOKEN}${currentRefreshToken}`);
        await this.redis.sRem(`${redis_keys_constants_1.REDIS_KEY_FAMILY_REFRESHES}${familyId}`, currentRefreshToken);
        const userDoc = await this.userRepo.findById(family.userId);
        const role = this.resolveRole(userDoc?.role, payload.email?.toLowerCase());
        const next = {
            id: family.userId,
            email: String(payload.email),
            username: String(payload.username),
            name: payload.name || '',
            role,
            familyId,
        };
        const { token: newAccess } = await this.issueAccessToken(next);
        const { token: newRefresh, jti: newRefreshJti } = await this.issueRefreshToken(next);
        family.currentJti = newRefreshJti;
        const refreshTtl = this.config.get('jwt.refreshTtlSecs');
        await this.redis.setEx(familyKey, refreshTtl, JSON.stringify(family));
        await this.redis.sAdd(`${redis_keys_constants_1.REDIS_KEY_FAMILY_REFRESHES}${familyId}`, newRefresh);
        await this.redis.expire(`${redis_keys_constants_1.REDIS_KEY_FAMILY_REFRESHES}${familyId}`, refreshTtl);
        await this.redis.sAdd(`${redis_keys_constants_1.REDIS_KEY_FAMILY_ACCESSES}${familyId}`, newAccess);
        await this.redis.expire(`${redis_keys_constants_1.REDIS_KEY_FAMILY_ACCESSES}${familyId}`, refreshTtl);
        return { success: true, messages: [], data: { token: newAccess, refreshToken: newRefresh } };
    }
    async logoutUser(accessToken, refreshToken) {
        try {
            let familyId;
            if (accessToken) {
                try {
                    const decoded = jwt.decode(accessToken);
                    familyId = decoded?.familyId;
                }
                catch { }
            }
            if (!familyId && refreshToken) {
                try {
                    const decoded = jwt.decode(refreshToken);
                    familyId = decoded?.familyId;
                }
                catch { }
            }
            if (familyId) {
                await this.revokeFamily(familyId);
            }
            else {
                const ops = [];
                if (refreshToken)
                    ops.push(this.redis.del(`${redis_keys_constants_1.REDIS_KEY_REFRESH_TOKEN}${refreshToken}`));
                if (accessToken)
                    ops.push(this.redis.del(`${redis_keys_constants_1.REDIS_KEY_ACCESS_TOKEN}${accessToken}`));
                if (ops.length)
                    await Promise.all(ops);
            }
        }
        catch (err) {
            this.logger.error(`Error during logout: ${err}`);
        }
    }
    resolveRole(dbRole, email) {
        if (dbRole === user_schema_1.UserRole.ADMIN)
            return 'admin';
        const adminEmails = (this.config.get('admin.emails') || []).map((e) => e.toLowerCase());
        if (email && adminEmails.includes(email))
            return 'admin';
        return 'user';
    }
    async issueAccessToken(base) {
        const ttl = this.config.get('jwt.accessTtlSecs');
        return this.signToken({ ...base, typ: 'access' }, ttl, redis_keys_constants_1.REDIS_KEY_ACCESS_TOKEN);
    }
    async issueRefreshToken(base) {
        const ttl = this.config.get('jwt.refreshTtlSecs');
        return this.signToken({ ...base, typ: 'refresh' }, ttl, redis_keys_constants_1.REDIS_KEY_REFRESH_TOKEN);
    }
    async signToken(payload, ttlSecs, redisPrefix) {
        const secret = this.config.get('jwt.secret');
        const issuer = this.config.get('jwt.issuer');
        const audience = this.config.get('jwt.audience');
        const jti = (0, crypto_1.randomUUID)();
        const fullPayload = { ...payload, jti };
        const token = jwt.sign(fullPayload, secret, {
            expiresIn: ttlSecs,
            issuer,
            audience,
            subject: String(payload.id),
        });
        await this.redis.setEx(`${redisPrefix}${token}`, ttlSecs, JSON.stringify(fullPayload));
        return { token, jti };
    }
    async persistFamily(familyId, userId, refreshJti, refreshToken, accessToken) {
        const refreshTtl = this.config.get('jwt.refreshTtlSecs');
        const family = { userId, currentJti: refreshJti };
        await this.redis.setEx(`${redis_keys_constants_1.REDIS_KEY_SESSION_FAMILY}${familyId}`, refreshTtl, JSON.stringify(family));
        await this.redis.sAdd(`${redis_keys_constants_1.REDIS_KEY_FAMILY_REFRESHES}${familyId}`, refreshToken);
        await this.redis.expire(`${redis_keys_constants_1.REDIS_KEY_FAMILY_REFRESHES}${familyId}`, refreshTtl);
        await this.redis.sAdd(`${redis_keys_constants_1.REDIS_KEY_FAMILY_ACCESSES}${familyId}`, accessToken);
        await this.redis.expire(`${redis_keys_constants_1.REDIS_KEY_FAMILY_ACCESSES}${familyId}`, refreshTtl);
    }
    async revokeFamily(familyId) {
        try {
            const refreshSet = `${redis_keys_constants_1.REDIS_KEY_FAMILY_REFRESHES}${familyId}`;
            const accessSet = `${redis_keys_constants_1.REDIS_KEY_FAMILY_ACCESSES}${familyId}`;
            const [refreshes, accesses] = await Promise.all([
                this.redis.sMembers(refreshSet),
                this.redis.sMembers(accessSet),
            ]);
            const ops = [];
            for (const t of refreshes || [])
                ops.push(this.redis.del(`${redis_keys_constants_1.REDIS_KEY_REFRESH_TOKEN}${t}`));
            for (const t of accesses || [])
                ops.push(this.redis.del(`${redis_keys_constants_1.REDIS_KEY_ACCESS_TOKEN}${t}`));
            ops.push(this.redis.del(refreshSet));
            ops.push(this.redis.del(accessSet));
            ops.push(this.redis.del(`${redis_keys_constants_1.REDIS_KEY_SESSION_FAMILY}${familyId}`));
            await Promise.all(ops);
        }
        catch (err) {
            this.logger.error(`Error revoking family ${familyId}: ${err}`);
        }
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = AuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Inject)(redis_module_1.REDIS_CLIENT)),
    __metadata("design:paramtypes", [config_1.ConfigService,
        user_repository_1.UserRepository, Object])
], AuthService);
//# sourceMappingURL=auth.service.js.map