const {
    getConfigHandler: serviceGetConfig,
    updateConfig: serviceUpdateConfig,
} = require('../services/appConfig.service');

const getConfig = async (req, res, next) => {
    try {
        const jsonResponse = await serviceGetConfig(req);
        res.status(200).json(jsonResponse);
    } catch (err) {
        next(err);
    }
};

const updateConfig = async (req, res, next) => {
    try {
        const jsonResponse = await serviceUpdateConfig(req);
        res.status(200).json(jsonResponse);
    } catch (err) {
        next(err);
    }
};

module.exports = { getConfig, updateConfig };
