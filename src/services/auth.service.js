const path = require('path');
const logger = require('../../shared/config/logger');
const filename = path.basename(__filename);
const BaseResponse = require('../../shared/util/baseResponse');
const BusinessException = require('../../shared/exceptionHandler/BusinessException');
const JWT_ACCESS_TOKEN_TTL_SECS = process.env.JWT_ACCESS_TOKEN_TTL_SECS;
const JWT_REFRESH_TOKEN_TTL_SECS = process.env.JWT_REFRESH_TOKEN_TTL_SECS;
const { REDIS_KEY_ACCESS_TOKEN, REDIS_KEY_REFRESH_TOKEN } = require('../../shared/util/constants');
const util = require('../../shared/util/util');
const jwt = require('../../shared/util/jwt');
const redisClient = require('../../shared/config/redis');
const bcrypt = require('bcryptjs');
const User = require('../models/user.model');
const { OAuth2Client } = require('google-auth-library');
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const logoutUser = async (req) => {
    try {
        let { refreshToken } = req.body;
        let token = req.headers['authorization'];
        console.log(token);
        token = jwt.verifyJwtToken(token);

        await redisClient.del(`${REDIS_KEY_REFRESH_TOKEN}${refreshToken}`);
        await redisClient.del(`${REDIS_KEY_ACCESS_TOKEN}${token}`);
    } catch (err) {
        logger.error(`Error logout: ${err}`, { className: filename });
    }
    message = req.__("SUCCESS_LOGOUT");
    return new BaseResponse(true, [message]);
}

const refreshTokenUser = async (req) => {
    try {
        let { refreshToken } = req.body;

        const tokenConcat = REDIS_KEY_REFRESH_TOKEN + refreshToken;
        const exists = await redisClient.exists(tokenConcat);
        if (exists !== 1) {
            throw new BusinessException('ERROR_AUTH', 401);
        }

        const user = {
            _id: jwt.getValueFromJwtToken(refreshToken, 'id', false),
            email: jwt.getValueFromJwtToken(refreshToken, 'email', false),
            username: jwt.getValueFromJwtToken(refreshToken, 'username', false),
            name: jwt.getValueFromJwtToken(refreshToken, 'name', false)
        };

        const payload = {
            id: user._id,
            email: user.email,
            username: user.username,
            name: user.name,
        };

        const payloadRefresh = {
            id: user._id,
            email: user.email,
            username: user.username,
            name: user.name,
            hash: util.generateRandomHash(),
        };

        await redisClient.del(`${REDIS_KEY_REFRESH_TOKEN}${refreshToken}`);
        const token = await generateTokenAndSaveToken(payload, JWT_ACCESS_TOKEN_TTL_SECS, REDIS_KEY_ACCESS_TOKEN);
        refreshToken = await generateTokenAndSaveToken(payloadRefresh, JWT_REFRESH_TOKEN_TTL_SECS, REDIS_KEY_REFRESH_TOKEN);

        return new BaseResponse(true, [], { token, refreshToken });
    } catch (err) {
        logger.error(`Error refreshing token: ${err}`, { className: filename });
        throw new BusinessException('ERROR_AUTH', 401);
    }
}

const loginUser = async (req) => {
    let { token } = req.body;

    let payload;
    try {
        const ticket = await googleClient.verifyIdToken({
            idToken: token,
            audience: process.env.GOOGLE_CLIENT_ID,
        });
        payload = ticket.getPayload();
    } catch (error) {
        throw new BusinessException('ERROR_LOGIN', 401);
    }

    let { email, name } = payload;
    email = email.toLowerCase();

    let user = await User.findOne({ email });

    if (!user) {
        // Auto-register: valid Google token but no account yet — create one
        let username = name.replace(/\s+/g, '_').toLowerCase();
        const existingUsername = await User.findOne({ username }).collation({ locale: 'en', strength: 2 });
        if (existingUsername) {
            username = username + Math.floor(Math.random() * 10000);
        }
        user = new User({ email, username, status: 'active' });
        await user.save();
    }

    if (user.status !== 'active') throw new BusinessException('ERROR_LOGIN', 401);

    const userPayload = {
        id: user._id,
        email: user.email,
        username: user.username,
        name: name,
    };

    const payloadRefresh = {
        id: user._id,
        email: user.email,
        username: user.username,
        name: name,
        hash: util.generateRandomHash(),
    };
    const accessToken = await generateTokenAndSaveToken(userPayload, JWT_ACCESS_TOKEN_TTL_SECS, REDIS_KEY_ACCESS_TOKEN);
    const refreshToken = await generateTokenAndSaveToken(payloadRefresh, JWT_REFRESH_TOKEN_TTL_SECS, REDIS_KEY_REFRESH_TOKEN);
    console.log(accessToken);
    return new BaseResponse(true, [], { token: accessToken, refreshToken });
};

const generateTokenAndSaveToken = async (payload, ttl, redisKey) => {
    const token = jwt.generateToken(payload, ttl);

    await redisClient.setEx(`${redisKey}${token}`, ttl, JSON.stringify(payload));
    return token;
};

module.exports = { loginUser, refreshTokenUser, logoutUser };
