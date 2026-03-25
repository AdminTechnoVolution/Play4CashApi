const { getValueFromJwtToken, verifyJwtToken } = require('../util/jwt');
const BusinessException = require('../exceptionHandler/BusinessException');
const { REDIS_KEY_ACCESS_TOKEN } = require('../util/constants');
const redisClient = require('../config/redis');

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());

module.exports = async (req, res, next) => {
    try {
        const auth = req.headers['authorization'];

        // 1. Verify the JWT is signed correctly and extract the email claim
        const email = getValueFromJwtToken(auth, 'email');
        if (!email || !ADMIN_EMAILS.includes(email.toLowerCase())) {
            throw new BusinessException('ERROR_AUTH', 403);
        }

        // 2. Verify the token has not been revoked in Redis (same check as validateToken)
        const token = verifyJwtToken(auth);
        if (!token) throw new BusinessException('ERROR_AUTH', 403);

        const exists = await redisClient.exists(`${REDIS_KEY_ACCESS_TOKEN}${token}`);
        if (exists !== 1) throw new BusinessException('ERROR_AUTH', 403);

        next();
    } catch (err) {
        next(err);
    }
};
