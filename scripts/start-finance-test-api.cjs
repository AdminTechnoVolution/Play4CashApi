const port = process.argv[2];
if (!['3184', '3185'].includes(port)) throw new Error('Only dedicated localhost test ports are allowed');
Object.assign(process.env, { NODE_ENV: 'test', PORT: port,
  MONGO_URI: 'mongodb://127.0.0.1:27184/p4c_game_e2e?replicaSet=p4c-test', REDIS_URI: 'redis://127.0.0.1:6388',
  FINANCE_V2_ENABLED: 'true', RELIABLE_COMMANDS_ENABLED: 'true', PAYMENTS_WORKER: 'false',
  PAYMENTS_DEPOSITS_ENABLED: 'false', PAYMENTS_WITHDRAWALS_ENABLED: 'false',
  NOWPAYMENTS_BASE_URL: 'https://api-sandbox.nowpayments.io/v1', NOWPAYMENTS_API_KEY: '', NOWPAYMENTS_PAYOUT_PASSWORD: '',
  NOWPAYMENTS_PAYOUT_TOTP_SECRET: '', JWT_SECRET_KEY: 'p4c-e2e-test-only-secret-key-2026',
  ADMIN_JWT_SECRET_KEY: 'p4c-e2e-test-only-admin-secret-2026',
  SOCKET_IO_REDIS_ADAPTER: 'true', ENABLE_SWAGGER: 'false', ENABLE_FAKE_LOGIN: 'false',
  EMAIL_SERVICE: '', EMAIL_FROM: '', EMAIL_PASS: '',
});
require('../dist/main.js');
