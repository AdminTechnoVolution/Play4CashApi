"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = () => ({
    port: parseInt(process.env.PORT || '3000', 10),
    mongoUri: process.env.MONGO_URI,
    redisUri: process.env.REDIS_URI,
    socketIoRedisAdapter: process.env.SOCKET_IO_REDIS_ADAPTER === 'true',
    jwt: {
        secret: process.env.JWT_SECRET_KEY,
        accessTtlSecs: parseInt(process.env.JWT_ACCESS_TOKEN_TTL_SECS || '3600', 10),
        refreshTtlSecs: parseInt(process.env.JWT_REFRESH_TOKEN_TTL_SECS || '86400', 10),
        issuer: process.env.JWT_ISSUER || 'play4cash-api',
        audience: process.env.JWT_AUDIENCE || 'play4cash-clients',
    },
    auth: {
        refreshCookieName: process.env.AUTH_REFRESH_COOKIE_NAME || 'p4c_refresh',
        refreshCookieSameSite: (process.env.AUTH_REFRESH_COOKIE_SAMESITE || 'lax'),
        refreshCookieSecure: process.env.AUTH_REFRESH_COOKIE_SECURE === 'true' ||
            process.env.NODE_ENV === 'production',
    },
    google: {
        clientId: process.env.GOOGLE_CLIENT_ID,
    },
    email: {
        service: process.env.EMAIL_SERVICE,
        from: process.env.EMAIL_FROM,
        pass: process.env.EMAIL_PASS,
        verificationExpiryMinutes: parseInt(process.env.EMAIL_VERIFICATION_EXPIRY_MINUTES || '60', 10),
    },
    binance: {
        apiKey: process.env.BINANCE_API_KEY,
        apiSecret: process.env.BINANCE_API_SECRET,
    },
    withdrawal: {
        processingExpiryMinutes: parseInt(process.env.PROCESSING_EXPIRY_MINUTES || '30', 10),
        verificationExpiryMinutes: parseInt(process.env.WITHDRAWAL_VERIFICATION_EXPIRY_MINUTES || '30', 10),
        minAmount: parseFloat(process.env.MIN_WITHDRAWAL || '10'),
        cronSchedule: process.env.JOB_CRON_WITHDRAWAL_IN_PROCESSING || '*/5 * * * *',
    },
    cors: {
        allowedOrigins: (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean),
        socketOrigin: process.env.SOCKET_ORIGIN || '*',
    },
    admin: {
        emails: (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase()),
    },
    swagger: {
        enabled: process.env.ENABLE_SWAGGER === 'true',
        password: process.env.SWAGGER_PASSWORD,
    },
    gateway: {
        trustSecret: process.env.GATEWAY_INTERNAL_SECRET || '',
        trustHeaderName: (process.env.GATEWAY_TRUST_HEADER_NAME || 'x-gateway-internal').toLowerCase(),
        trustedIps: (process.env.TRUSTED_GATEWAY_IPS || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
    },
    pwa: {
        minVersion: (process.env.PWA_MIN_VERSION || '').trim(),
        statsSampleRate: clamp01(parseFloat(process.env.PWA_STATS_SAMPLE_RATE || '0.1')),
        statsRetentionDays: Math.max(1, parseInt(process.env.PWA_STATS_RETENTION_DAYS || '31', 10) || 31),
    },
});
function clamp01(n) {
    if (Number.isNaN(n))
        return 0;
    return Math.min(1, Math.max(0, n));
}
//# sourceMappingURL=configuration.js.map