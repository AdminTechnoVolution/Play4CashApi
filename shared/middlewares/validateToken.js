const path = require('path');
const logger = require('../config/logger');
const filename = path.basename(__filename);
const BaseResponse = require('../util/baseResponse');
const BusinessException = require('../exceptionHandler/BusinessException');
const { REDIS_KEY_ACCESS_TOKEN } = require('../util/constants');
const { verifyJwtToken } = require('../util/jwt');
const redisClient = require('../config/redis');

module.exports = (req, res, next) => {
    let token = req.headers['authorization'];
    if (!token)
        throw new BusinessException('ERROR_AUTH');

    token = verifyJwtToken(token);
    if (token === '')
        throw new BusinessException('ERROR_AUTH');

    try {
        exists = validateToken(token);
        if (!exists)
            throw new BusinessException('ERROR_AUTH');

        next();
    } catch (err) {
        const message = req.__(err.message);
        const response = new BaseResponse(false, message);
        return res.status(401).json(response);
    }
};

function validateJwtSocketConnection(token) {
    if (!token)
        throw new BusinessException('ERROR_AUTH');

    token = verifyJwtToken(token);
    if (token === '')
        throw new BusinessException('ERROR_AUTH');

    try {
        exists = validateToken(token);
        if (!exists)
            throw new BusinessException('ERROR_AUTH');
        return new BaseResponse(true);
    } catch (err) {
        const message = err.message;
        return new BaseResponse(false, message);
    }
}

async function validateToken(token) {
    try {
        const tokenConcat = REDIS_KEY_ACCESS_TOKEN + token;
        const exists = await redisClient.exists(tokenConcat);
        return exists === 1;
    } catch (err) {
        logger.error(`Error validating or refreshing token: ${err}`, { className: filename });
        return false;
    }
}

module.exports.validateJwtSocketConnection = validateJwtSocketConnection;