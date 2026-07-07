"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
const swagger_1 = require("@nestjs/swagger");
const config_1 = require("@nestjs/config");
const helmet_1 = __importDefault(require("helmet"));
const express_mongo_sanitize_1 = __importDefault(require("express-mongo-sanitize"));
const strip_untrusted_gateway_user_middleware_1 = require("./common/middleware/strip-untrusted-gateway-user.middleware");
const app_version_headers_middleware_1 = require("./common/middleware/app-version-headers.middleware");
const redis_io_adapter_1 = require("./common/adapters/redis-io.adapter");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    const config = app.get(config_1.ConfigService);
    const nodeEnv = process.env.NODE_ENV ?? 'development';
    const useRedisAdapter = config.get('socketIoRedisAdapter');
    if (nodeEnv === 'production' && !useRedisAdapter) {
        throw new Error('SOCKET_IO_REDIS_ADAPTER must be true in production for cross-pod Socket.IO broadcasts');
    }
    if (useRedisAdapter) {
        const redisUri = config.get('redisUri');
        if (!redisUri) {
            throw new Error('SOCKET_IO_REDIS_ADAPTER=true requires REDIS_URI');
        }
        const redisIoAdapter = new redis_io_adapter_1.RedisIoAdapter(app);
        await redisIoAdapter.connectToRedis(redisUri);
        app.useWebSocketAdapter(redisIoAdapter);
        console.log('[Socket.IO] Redis adapter enabled');
    }
    app.set('trust proxy', 1);
    app.use((0, helmet_1.default)());
    app.use((0, strip_untrusted_gateway_user_middleware_1.createStripUntrustedGatewayUserMiddleware)(config));
    app.use((0, app_version_headers_middleware_1.createAppVersionHeadersMiddleware)(config));
    app.use((req, _res, next) => {
        const method = req.method;
        const url = req.url;
        const gatewayCtx = req.headers['x-gateway-user'] ? 'present' : 'absent';
        const bodySize = req.headers['content-length'] || '0';
        const contentType = req.headers['content-type'] || 'None';
        const startTime = Date.now();
        console.log(`[Tracer] INCOMING: ${method} ${url} | Size=${bodySize} | Type=${contentType} | GatewayCtx=${gatewayCtx}`);
        _res.on('finish', () => {
            const duration = Date.now() - startTime;
            console.log(`[Tracer] COMPLETED: ${method} ${url} | Status=${_res.statusCode} | Duration=${duration}ms`);
        });
        _res.on('close', () => {
            if (!_res.writableFinished) {
                console.warn(`[Tracer] CLOSED PREMATURELY: ${method} ${url} | Duration=${Date.now() - startTime}ms`);
            }
        });
        next();
    });
    app.use((req, _res, next) => {
        if (req.body) {
            req.body = express_mongo_sanitize_1.default.sanitize(req.body);
        }
        if (req.params)
            req.params = express_mongo_sanitize_1.default.sanitize(req.params);
        next();
    });
    const allowedOrigins = config.get('cors.allowedOrigins') || [];
    app.enableCors({
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
                callback(null, true);
            }
            else {
                callback(null, false);
            }
        },
        credentials: true,
        exposedHeaders: ['X-App-Min-Version'],
    });
    app.setGlobalPrefix('api');
    if (config.get('swagger.enabled')) {
        const swaggerPassword = config.get('swagger.password');
        const swaggerConfig = new swagger_1.DocumentBuilder()
            .setTitle('Play4Cash API')
            .setDescription('Play4Cash RESTful & WebSocket API')
            .setVersion('2.0')
            .addBearerAuth()
            .build();
        const document = swagger_1.SwaggerModule.createDocument(app, swaggerConfig);
        app.use('/api-docs', (req, res, next) => {
            if (!swaggerPassword)
                return res.status(403).json({ success: false, messages: ['Swagger not accessible'] });
            const authHeader = req.headers['authorization'] || '';
            if (!authHeader.startsWith('Basic ')) {
                res.setHeader('WWW-Authenticate', 'Basic realm="Swagger API Docs"');
                return res.status(401).json({ success: false, messages: ['Authentication required'] });
            }
            const [, password] = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
            if (password !== swaggerPassword) {
                res.setHeader('WWW-Authenticate', 'Basic realm="Swagger API Docs"');
                return res.status(401).json({ success: false, messages: ['Invalid credentials'] });
            }
            next();
        });
        swagger_1.SwaggerModule.setup('api-docs', app, document);
    }
    const port = config.get('port') || 3000;
    await app.listen(port, '0.0.0.0');
    console.log(`🚀 Play4Cash NestJS server running on port ${port}`);
}
bootstrap();
//# sourceMappingURL=main.js.map