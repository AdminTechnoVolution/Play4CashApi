/**
 * cluster.js — Production entry point for multi-core deployment.
 *
 * Use this instead of `node server.js` in production:
 *   node cluster.js
 *
 * Or via PM2:
 *   pm2 start cluster.js --name play4cash
 *
 * How it works:
 *  - The PRIMARY process forks one worker per CPU core.
 *  - Each WORKER runs the full server.js (Express + WebSocket).
 *  - If a worker crashes, the primary automatically restarts it.
 *  - The Socket.IO Redis adapter (ws.js) ensures WebSocket events
 *    are shared across all workers, so users on different workers
 *    can still communicate in real time.
 */
const cluster = require('cluster');
const os = require('os');
const path = require('path');
const logger = require('./shared/config/logger');
const filename = path.basename(__filename);

const NUM_WORKERS = parseInt(process.env.CLUSTER_WORKERS) || os.cpus().length;

if (cluster.isPrimary) {
    logger.info(`[Cluster] Primary ${process.pid} starting ${NUM_WORKERS} workers`, { className: filename });

    for (let i = 0; i < NUM_WORKERS; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
        logger.error(
            `[Cluster] Worker ${worker.process.pid} exited (code=${code}, signal=${signal}). Restarting...`,
            { className: filename }
        );
        cluster.fork(); // Auto-restart crashed workers
    });

    cluster.on('online', (worker) => {
        logger.info(`[Cluster] Worker ${worker.process.pid} is online`, { className: filename });
    });

} else {
    // Workers run the full application
    require('./server');
}
