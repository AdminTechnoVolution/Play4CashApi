require('dotenv').config();
require('./shared/jobs/withdrawalInProcessing');
const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const logger = require('./shared/config/logger');
const filename = path.basename(__filename);
const mongoose = require('./shared/config/mongo');
const redisClient = require('./shared/config/redis');
const i18n = require('./shared/language/i18n');
const userRoutes = require('./src/routes/user.route');
const loginRoutes = require('./src/routes/auth.route');
const rechargesRoutes = require('./src/routes/recharge.route');
const gamesRoutes = require('./src/routes/game.route');
const roomRoutes = require('./src/routes/room.route');
const battleshipPlacementRoutes = require('./src/routes/battleshipPlacement.routes');
const withdrawalRoutes = require('./src/routes/withdrawal.route');
const wsRoutes = require('./src/routes/ws.route');
const walletRoutes = require('./src/routes/wallet.route');
const appConfigRoutes = require('./src/routes/appConfig.route');
const { setupWebSocketServer } = require('./shared/config/ws');
const exceptionHandler = require('./shared/exceptionHandler/exceptionHandler');
const { swaggerUi, swaggerSpec } = require('./shared/config/swagger');
const { rateLimit } = require('express-rate-limit');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');

const app = express();

// Security headers — must be first
app.use(helmet());
app.use(i18n.init);
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);

app.use(cors({
    origin: (origin, callback) => {
        // Allow server-to-server requests (no origin) and whitelisted origins
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error(`CORS: origin '${origin}' not allowed`));
        }
    },
    credentials: true
}));

app.use(express.json());

// NoSQL injection protection — strips $ and . from user inputs.
// Note: express-mongo-sanitize middleware is incompatible with Express 5's
// read-only req.query getter, so we call sanitize() manually on writable fields.
app.use((req, res, next) => {
    if (req.body) req.body = mongoSanitize.sanitize(req.body);
    if (req.params) req.params = mongoSanitize.sanitize(req.params);
    next();
});

// ─── Rate Limiting ────────────────────────────────────────────────────────────
// Strict limiter on auth endpoints (brute-force protection)
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { success: false, messages: ['Too many login attempts. Please try again in 15 minutes.'] }
});
// General limiter on all API routes
const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    limit: 300,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { success: false, messages: ['Too many requests. Please slow down.'] }
});

app.use('/api/login', loginLimiter);
app.use('/api/', apiLimiter);
// ─────────────────────────────────────────────────────────────────────────────

app.use('/api/user', userRoutes);
app.use('/api/', loginRoutes);
app.use('/api/transactions/', rechargesRoutes);
app.use('/api/transactions/', withdrawalRoutes);
app.use('/api/games', gamesRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/rooms/:roomId/battleship/placement', battleshipPlacementRoutes);
app.use('/api', wsRoutes);
app.use('/api', walletRoutes);
app.use('/api', appConfigRoutes);
app.use(exceptionHandler);

const server = http.createServer(app);

if (process.env.ENABLE_SWAGGER === 'true') {
    const swaggerPassword = process.env.SWAGGER_PASSWORD;

    // Basic Auth guard for Swagger UI
    const swaggerAuth = (req, res, next) => {
        if (!swaggerPassword) {
            // No password configured — block access entirely in production
            return res.status(403).json({ success: false, messages: ['Swagger is not accessible.'] });
        }
        const authHeader = req.headers['authorization'];
        if (!authHeader || !authHeader.startsWith('Basic ')) {
            res.setHeader('WWW-Authenticate', 'Basic realm="Swagger API Docs"');
            return res.status(401).json({ success: false, messages: ['Authentication required.'] });
        }
        const base64 = authHeader.split(' ')[1];
        const [, password] = Buffer.from(base64, 'base64').toString().split(':');
        if (password !== swaggerPassword) {
            res.setHeader('WWW-Authenticate', 'Basic realm="Swagger API Docs"');
            return res.status(401).json({ success: false, messages: ['Invalid credentials.'] });
        }
        next();
    };

    app.use('/api-docs', swaggerAuth, swaggerUi.serve, swaggerUi.setup(swaggerSpec));
    logger.info('Swagger documentation enabled (password protected)', { className: filename });
}

// Bootstrap: await Redis adapter connection before accepting traffic
(async () => {
    await setupWebSocketServer(server);
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, '0.0.0.0', () =>
        logger.info(`Play4Cash server running on port ${PORT}`, { className: filename })
    );
})();