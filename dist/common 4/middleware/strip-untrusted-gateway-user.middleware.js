"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createStripUntrustedGatewayUserMiddleware = createStripUntrustedGatewayUserMiddleware;
function createStripUntrustedGatewayUserMiddleware(config) {
    return (req, _res, next) => {
        const headers = req.headers;
        const trustHeaderName = config.get('gateway.trustHeaderName') || 'x-gateway-internal';
        const secret = config.get('gateway.trustSecret') || '';
        const trustedIps = config.get('gateway.trustedIps') || [];
        const incomingTrust = headers[trustHeaderName];
        const trustToken = Array.isArray(incomingTrust) ? incomingTrust[0] : incomingTrust;
        let trusted = false;
        if (secret && trustToken === secret) {
            trusted = true;
        }
        else if (trustedIps.length > 0) {
            const ip = req.ip ||
                req.socket?.remoteAddress ||
                '';
            trusted = trustedIps.some((allowed) => allowed === ip);
        }
        const hasTrustConfig = !!secret || trustedIps.length > 0;
        if (!hasTrustConfig || !trusted) {
            delete headers['x-gateway-user'];
        }
        delete headers[trustHeaderName];
        next();
    };
}
//# sourceMappingURL=strip-untrusted-gateway-user.middleware.js.map