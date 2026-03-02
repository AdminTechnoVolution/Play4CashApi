const path = require('path');
const logger = require('../config/logger');
const filename = path.basename(__filename);
const redis = require('redis');

const redisClient = redis.createClient({
    url: process.env.REDIS_URI,
    socket: {
        reconnectStrategy: (retries) => {
            return 60000;
        }
    }
});

redisClient.connect();

redisClient.on('ready', () => {
    logger.info('Redis connected', { className: filename });
});

redisClient.on('error', (err) => {
    logger.error('Redis failed connection. Error:' + err, { className: filename });
});

redisClient.on('end', () => {
    logger.info('Redis connection closed', { className: filename });
});

redisClient.on('close', () => {
    logger.info('Redis connection closed', { className: filename });
});

redisClient.on('reconnecting', () => {
    logger.info('Attempting to reconnect to Redis...', { className: filename });
});

module.exports = redisClient;