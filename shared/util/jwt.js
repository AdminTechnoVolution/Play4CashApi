const path = require('path');
const logger = require('../config/logger');
const filename = path.basename(__filename);
const jwt = require('jsonwebtoken');
const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY;

const generateToken = (payload, expiresIn) => {
    const expiresInSec = expiresIn + 's';
    return jwt.sign(payload, JWT_SECRET_KEY, { expiresIn: expiresInSec });
};

const getValueFromJwtToken = (token, key, hasBearer = true) => {
    try {
        if (hasBearer)
            token = token.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET_KEY);

        return decoded[key] || '';
    } catch (error) {
        logger.error(`Error decoding JWT token: ${error}`, { className: filename });
        return '';
    }
}

const verifyJwtToken = (token) => {
    try {
        token = token.split(' ')[1];
        jwt.verify(token, JWT_SECRET_KEY);
        return token;
    } catch (error) {
        logger.error(`Error verifying JWT token: ${error}`, { className: filename });
        return '';
    }
}

module.exports = { generateToken, getValueFromJwtToken, verifyJwtToken };