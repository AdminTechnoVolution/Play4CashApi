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
const setupWebSocketServer = require('./shared/config/ws');
const exceptionHandler = require('./shared/exceptionHandler/exceptionHandler');
const { swaggerUi, swaggerSpec } = require('./shared/config/swagger');

const app = express();

app.use(i18n.init);
app.use(cors());
app.use(express.json());
app.use('/api/user', userRoutes);
app.use('/api/', loginRoutes);
app.use('/api/transactions/', rechargesRoutes);
app.use('/api/transactions/', withdrawalRoutes);
app.use('/api/games', gamesRoutes);
app.use('/api/rooms', roomRoutes);
app.use('/api/rooms/:roomId/battleship/placement', battleshipPlacementRoutes);
app.use('/api', wsRoutes);
app.use(exceptionHandler);

const server = http.createServer(app);

if (process.env.ENABLE_SWAGGER === 'true') {
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
    logger.info('Swagger documentation enabled', { className: filename });
}

setupWebSocketServer(server);
const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () =>
    logger.info(`Play4Cash server running on port ${PORT}`, { className: filename })
);