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
Object.defineProperty(exports, "__esModule", { value: true });
exports.WsAuthGuard = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const websockets_1 = require("@nestjs/websockets");
const jwt = __importStar(require("jsonwebtoken"));
const redis_module_1 = require("../redis/redis.module");
const common_2 = require("@nestjs/common");
const redis_keys_constants_1 = require("../constants/redis-keys.constants");
let WsAuthGuard = class WsAuthGuard {
    config;
    redis;
    constructor(config, redis) {
        this.config = config;
        this.redis = redis;
    }
    async canActivate(context) {
        const client = context.switchToWs().getClient();
        let token = client.handshake.auth?.token ||
            client.handshake.query?.token ||
            client.handshake.headers?.authorization || '';
        if (token.startsWith('Bearer '))
            token = token.slice(7);
        if (!token)
            throw new websockets_1.WsException('ERROR_AUTH');
        let payload;
        try {
            payload = jwt.verify(token, this.config.get('jwt.secret'));
        }
        catch {
            throw new websockets_1.WsException('ERROR_AUTH');
        }
        const exists = await this.redis.exists(`${redis_keys_constants_1.REDIS_KEY_ACCESS_TOKEN}${token}`);
        if (exists !== 1)
            throw new websockets_1.WsException('ERROR_AUTH');
        client.data.player_id = payload.id;
        client.data.token = token;
        return true;
    }
};
exports.WsAuthGuard = WsAuthGuard;
exports.WsAuthGuard = WsAuthGuard = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_2.Inject)(redis_module_1.REDIS_CLIENT)),
    __metadata("design:paramtypes", [config_1.ConfigService, Object])
], WsAuthGuard);
//# sourceMappingURL=ws-auth.guard.js.map