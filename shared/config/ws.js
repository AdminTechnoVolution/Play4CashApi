const BusinessException = require('../exceptionHandler/BusinessException');
const { validateJwtSocketConnection } = require('../middlewares/validateToken');
const { Server } = require('socket.io');

const namespaces = [
    { path: '/rps', handler: require('../../src/websockets/rps') },
    { path: '/naval-battle', handler: require('../../src/websockets/naval-battle') },
    { path: '/halma', handler: require('../../src/websockets/halma') },
    { path: '/chess', handler: require('../../src/websockets/chess') },
    { path: '/rooms', handler: require('../../src/websockets/rooms') }
];


let ioInstance = null;

function setupWebSocketServer(server) {
    const io = new Server(server, {
        cors: {
            origin: process.env.SOCKET_ORIGIN,
            methods: ['GET', 'POST']
        }
    });

    ioInstance = io;

    // 1. Middleware to validate the token
    // 2. Register namespaces and their handlers
    namespaces.forEach(({ path, handler }) => {
        const namespace = io.of(path);

        namespace.use(async (socket, next) => {
            try {
                let token = socket.handshake.auth?.token || socket.handshake.query?.token || socket.handshake.headers?.authorization;
                if (token && token.startsWith('Bearer ')) {
                    token = token.split(' ')[1];
                }

                console.log(`[WS Auth Debug] Namespace: ${path}`);
                console.log(`[WS Auth Debug] Handshake Query:`, socket.handshake.query);
                console.log(`[WS Auth Debug] Handshake Auth:`, socket.handshake.auth);
                console.log(`[WS Auth Debug] Extracted Token:`, token ? `${token.substring(0, 10)}...` : 'undefined');

                const response = await validateJwtSocketConnection(token);
                if (response.success === false) {
                    throw new BusinessException('ERROR_AUTH');
                }

                // Store token in socket data for handlers to use reliably
                socket.data.token = token;

                next();
            } catch (err) {
                console.error(`[WS Auth Debug] Auth Error:`, err.message);
                // Note: Socket.IO requires an Error object for middleware rejection
                const error = new Error('ERROR_AUTH');
                error.data = { status: 401, message: 'Unauthorized' };
                next(error);
            }
        });

        namespace.on('connection', (socket) => {
            console.log(`[WS Connection] Socket ${socket.id} connected to namespace ${path}`);
            handler(socket, namespace);
            
            socket.on('disconnect', (reason) => {
                console.log(`[WS Connection] Socket ${socket.id} disconnected from namespace ${path}. Reason: ${reason}`);
            });
        });
    });

    return io;
}

module.exports = {
    setupWebSocketServer,
    getIo: () => ioInstance
};
