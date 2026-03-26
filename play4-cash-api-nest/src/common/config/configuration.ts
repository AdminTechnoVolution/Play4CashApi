export default () => ({
  port: parseInt(process.env.PORT || '3000', 10),
  mongoUri: process.env.MONGO_URI,
  redisUri: process.env.REDIS_URI,
  jwt: {
    secret: process.env.JWT_SECRET_KEY,
    accessTtlSecs: parseInt(process.env.JWT_ACCESS_TOKEN_TTL_SECS || '3600', 10),
    refreshTtlSecs: parseInt(process.env.JWT_REFRESH_TOKEN_TTL_SECS || '86400', 10),
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
});
