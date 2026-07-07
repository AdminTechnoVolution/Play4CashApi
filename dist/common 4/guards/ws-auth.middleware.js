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
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyWsAuth = applyWsAuth;
const jwt = __importStar(require("jsonwebtoken"));
const redis_keys_constants_1 = require("../constants/redis-keys.constants");
const jwt_token_util_1 = require("../auth/jwt-token.util");
function applyWsAuth(server, config, redis) {
    const jwtSecret = config.get('jwt.secret');
    const verifyOpts = (0, jwt_token_util_1.jwtVerifyOptions)(config);
    server.use(async (socket, next) => {
        let token = socket.handshake.auth?.token ||
            socket.handshake.query?.token ||
            socket.handshake.headers?.authorization || '';
        if (token.startsWith('Bearer '))
            token = token.slice(7);
        if (!token)
            return next(new Error('ERROR_AUTH'));
        let payload;
        try {
            payload = jwt.verify(token, jwtSecret, verifyOpts);
        }
        catch {
            return next(new Error('ERROR_AUTH'));
        }
        if (!(0, jwt_token_util_1.isAccessTokenPayload)(payload)) {
            return next(new Error('ERROR_AUTH'));
        }
        try {
            const exists = await redis.exists(`${redis_keys_constants_1.REDIS_KEY_ACCESS_TOKEN}${token}`);
            if (exists !== 1)
                return next(new Error('ERROR_AUTH'));
        }
        catch {
            return next(new Error('ERROR_AUTH'));
        }
        socket.data.player_id = payload.id;
        socket.data.token = token;
        next();
    });
}
//# sourceMappingURL=ws-auth.middleware.js.map