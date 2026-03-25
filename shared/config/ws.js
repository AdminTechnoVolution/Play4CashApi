const path = require('path');
const logger = require('./logger');
const filename = path.basename(__filename);
const BusinessException = require('../exceptionHandler/BusinessException');
const { validateJwtSocketConnection } = require('../middlewares/validateToken');
const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const redis = require('redis');

const namespaces = [
    { path: '/rps', handler: require('../../src/websockets/rps') },
    { path: '/naval-battle', handler: require('../../src/websockets/naval-battle') },
    { path: '/halma', handler: require('../../src/websockets/halma') },
    { path: '/chess', handler: require('../../src/websockets/chess') },
    { path: '/domino', handler: require('../../src/websockets/domino') },
    { path: '/rooms', handler: require('../../src/websockets/rooms') }
];


let ioInstance = null;

async function setupWebSocketServer(server) {
    const io = new Server(server, {
        cors: {
            origin: process.env.SOCKET_ORIGIN,
            methods: ['GET', 'POST']
        }
    });

    // ─── Redis Adapter (horizontal scaling) ──────────────────────────────────
    // The adapter uses a dedicated pub/sub Redis client pair so that WebSocket
    // events are shared across all server instances (cluster workers or separate
    // machines). Without this, each process only delivers events to its own
    // connected clients.
    try {
        const pubClient = redis.createClient({ url: process.env.REDIS_URI });
        const subClient = pubClient.duplicate();

        await Promise.all([pubClient.connect(), subClient.connect()]);

        io.adapter(createAdapter(pubClient, subClient));
        logger.info('[WS] Socket.IO Redis adapter connected', { className: filename });

        pubClient.on('error', (err) => logger.error(`[WS] Redis pub client error: ${err}`, { className: filename }));
        subClient.on('error', (err) => logger.error(`[WS] Redis sub client error: ${err}`, { className: filename }));
    } catch (err) {
        logger.error(`[WS] Failed to connect Redis adapter — running WITHOUT adapter (single-instance mode): ${err}`, { className: filename });
        // Graceful degradation: server still works, just not horizontally scaled
    }
    // ─────────────────────────────────────────────────────────────────────────

    ioInstance = io;

    // Register namespaces and their handlers
    namespaces.forEach(({ path, handler }) => {
        const namespace = io.of(path);

        namespace.use(async (socket, next) => {
            try {
                let token = socket.handshake.auth?.token || socket.handshake.query?.token || socket.handshake.headers?.authorization;
                if (token && token.startsWith('Bearer ')) {
                    token = token.split(' ')[1];
                }

                const response = await validateJwtSocketConnection(token);
                if (response.success === false) {
                    throw new BusinessException('ERROR_AUTH');
                }

                // Store token in socket data for handlers to use reliably
                socket.data.token = token;

                next();
            } catch (err) {
                logger.error(`[WS] Auth error on namespace ${path}: ${err.message}`, { className: filename });
                const error = new Error('ERROR_AUTH');
                error.data = { status: 401, message: 'Unauthorized' };
                next(error);
            }
        });

        namespace.on('connection', (socket) => {
            logger.debug(`[WS] Socket connected: namespace=${path} id=${socket.id}`, { className: filename });
            handler(socket, namespace);

            socket.on('disconnect', (reason) => {
                logger.debug(`[WS] Socket disconnected: namespace=${path} id=${socket.id} reason=${reason}`, { className: filename });
            });
        });
    });

    return io;
}

module.exports = {
    setupWebSocketServer,
    getIo: () => ioInstance
};

