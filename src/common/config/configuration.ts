export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  mongoUri: process.env.MONGO_URI,
  redisUri: process.env.REDIS_URI,
  jwt: {
    secret: process.env.JWT_SECRET_KEY,
    accessTtlSecs: parseInt(process.env.JWT_ACCESS_TOKEN_TTL_SECS || '3600', 10),
    refreshTtlSecs: parseInt(process.env.JWT_REFRESH_TOKEN_TTL_SECS || '86400', 10),
    issuer: process.env.JWT_ISSUER || 'play4cash-api',
    audience: process.env.JWT_AUDIENCE || 'play4cash-clients',
  },
  auth: {
    /** HttpOnly cookie for refresh token (browser clients). Name must match PWA expectations if overridden. */
    refreshCookieName: process.env.AUTH_REFRESH_COOKIE_NAME || 'p4c_refresh',
    /** Use `none` when the SPA is on a different site than the API (requires secure cookies). */
    refreshCookieSameSite: (process.env.AUTH_REFRESH_COOKIE_SAMESITE || 'lax') as 'lax' | 'strict' | 'none',
    refreshCookieSecure:
      process.env.AUTH_REFRESH_COOKIE_SECURE === 'true' ||
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
    /** Shared secret the gateway sets on proxied requests (header below). Empty = do not use secret-based trust. */
    trustSecret: process.env.GATEWAY_INTERNAL_SECRET || '',
    trustHeaderName: (process.env.GATEWAY_TRUST_HEADER_NAME || 'x-gateway-internal').toLowerCase(),
    /** Comma-separated IPs allowed to send x-gateway-user without the secret (e.g. gateway pod IP). */
    trustedIps: (process.env.TRUSTED_GATEWAY_IPS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  },
  pwa: {
    /**
     * Minimum PWA semver (e.g. "1.2.0") required by this API. When set, every response carries
     * `X-App-Min-Version: <value>`. The PWA reads it and forces a hard reload modal if the
     * running version is older. Leave empty to disable forced upgrades.
     */
    minVersion: (process.env.PWA_MIN_VERSION || '').trim(),
    /**
     * 0..1 fraction of API requests whose `X-App-Version` header is recorded into Redis daily
     * counters. Default 0.1 (10%). Set to 0 to disable stats writes entirely.
     */
    statsSampleRate: clamp01(parseFloat(process.env.PWA_STATS_SAMPLE_RATE || '0.1')),
    /** TTL (days) for daily version-distribution counters. Default 31. */
    statsRetentionDays: Math.max(1, parseInt(process.env.PWA_STATS_RETENTION_DAYS || '31', 10) || 31),
  },
});

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}
