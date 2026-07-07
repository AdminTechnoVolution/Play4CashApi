"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.jwtVerifyOptions = jwtVerifyOptions;
exports.isAccessTokenPayload = isAccessTokenPayload;
exports.isRefreshTokenPayload = isRefreshTokenPayload;
function jwtVerifyOptions(config) {
    return {
        issuer: config.get('jwt.issuer'),
        audience: config.get('jwt.audience'),
    };
}
function isAccessTokenPayload(payload) {
    return typeof payload === 'object' && payload !== null && payload.typ === 'access';
}
function isRefreshTokenPayload(payload) {
    return typeof payload === 'object' && payload !== null && payload.typ === 'refresh';
}
//# sourceMappingURL=jwt-token.util.js.map