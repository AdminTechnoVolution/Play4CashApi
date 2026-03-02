const BusinessException = require('../exceptionHandler/BusinessException');
const { validateJwtSocketConnection } = require('../middlewares/validateToken');
const { Server } = require('socket.io');

const namespaces = [
    { path: '/rps', handler: require('../../src/websockets/rps') },
    { path: '/naval-battle', handler: require('../../src/websockets/naval-battle') }
];

function setupWebSocketServer(server) {
    const io = new Server(server, {
        cors: {
            origin: process.env.SOCKET_ORIGIN,
            methods: ['GET', 'POST']
        }
    });

    // 1. Middleware to validate the token
    // 2. Register namespaces and their handlers
    namespaces.forEach(({ path, handler }) => {
        const namespace = io.of(path);

        namespace.use((socket, next) => {
            try {
                const token = socket.handshake.query.token;
                const response = validateJwtSocketConnection(token);
                if (response.success === false) {
                    throw new BusinessException('ERROR_AUTH');
                }

                next();
            } catch (err) {
                next(new Error(err.message));
            }
        });

        namespace.on('connection', (socket) => {
            handler(socket, namespace);
        });
    });

    return io;
}

module.exports = setupWebSocketServer;
