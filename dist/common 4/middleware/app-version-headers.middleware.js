"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAppVersionHeadersMiddleware = createAppVersionHeadersMiddleware;
function createAppVersionHeadersMiddleware(config) {
    const minVersion = config.get('pwa.minVersion') || '';
    return (req, res, next) => {
        if (minVersion) {
            res.setHeader('X-App-Min-Version', minVersion);
        }
        const incoming = req.headers['x-app-version'];
        const clientVersion = Array.isArray(incoming) ? incoming[0] : incoming;
        if (clientVersion) {
            req.clientAppVersion = String(clientVersion);
        }
        next();
    };
}
//# sourceMappingURL=app-version-headers.middleware.js.map