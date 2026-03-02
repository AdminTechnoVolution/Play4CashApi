const path = require('path');
const logger = require('../config/logger');
const filename = path.basename(__filename);

const mongoose = require('mongoose');

const connectWithRetry = () => {
    mongoose.connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 60000,
    }).catch(err => {
        logger.error('MongoDB attempting to reconnect. MongoDB connection error:', err, { className: filename });
        setTimeout(connectWithRetry, 60000);
    });
};

mongoose.connection.on('connected', () => {
    logger.info('MongoDB connected', { className: filename });
});

mongoose.connection.on('close', () => {
    logger.info('MongoDB connection closed', { className: filename });
});

mongoose.connection.on('disconnected', () => {
    connectWithRetry();
});

connectWithRetry();

module.exports = mongoose;
