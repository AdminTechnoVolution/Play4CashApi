const path = require('path');
const logger = require('../../shared/config/logger');
const filename = path.basename(__filename);
const BaseResponse = require('../../shared/util/baseResponse');
const BusinessException = require('../../shared/exceptionHandler/BusinessException');
const AppConfig = require('../models/appConfig.model');

const GLOBAL_KEY = 'global';

/**
 * Returns the global app config document.
 * If it doesn't exist yet, creates it with defaults.
 */
const getConfig = async () => {
    let config = await AppConfig.findOne({ key: GLOBAL_KEY }).lean();
    if (!config) {
        config = await AppConfig.create({ key: GLOBAL_KEY });
        config = config.toObject();
    }
    return config;
};

const getConfigHandler = async (req) => {
    const config = await getConfig();
    const data = {
        withdrawal_daily_limit: config.withdrawal_daily_limit,
    };
    return new BaseResponse(true, [], data);
};

const updateConfig = async (req) => {
    const { withdrawal_daily_limit } = req.body;
    const updates = {};

    if (withdrawal_daily_limit !== undefined) {
        if (isNaN(withdrawal_daily_limit) || withdrawal_daily_limit <= 0) {
            throw new BusinessException('ERROR_BAD_REQUEST_RESPONSE', 400);
        }
        updates.withdrawal_daily_limit = withdrawal_daily_limit;
    }

    if (Object.keys(updates).length === 0) {
        throw new BusinessException('ERROR_BAD_REQUEST_RESPONSE', 400);
    }

    const config = await AppConfig.findOneAndUpdate(
        { key: GLOBAL_KEY },
        { $set: updates },
        { new: true, upsert: true }
    ).lean();

    logger.info(`AppConfig updated: ${JSON.stringify(updates)}`, { className: filename });

    return new BaseResponse(true, [], {
        withdrawal_daily_limit: config.withdrawal_daily_limit,
    });
};

module.exports = { getConfig, getConfigHandler, updateConfig };
