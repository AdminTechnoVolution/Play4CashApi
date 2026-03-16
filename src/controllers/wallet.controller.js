const { ERROR_BAD_REQUEST_RESPONSE } = require('../../shared/util/constants');
const { createWallet: serviceCreateWallet, getWallets: serviceGetWallets } = require('../services/wallet.service');
const BusinessException = require('../../shared/exceptionHandler/BusinessException');

const createWallet = async (req, res, next) => {
    try {
        if (!req.body) throw new BusinessException(ERROR_BAD_REQUEST_RESPONSE);

        let jsonResponse = await serviceCreateWallet(req);
        res.status(200).json(jsonResponse);
    } catch (err) {
        next(err);
    }
};

const getWallets = async (req, res, next) => {
    try {
        let jsonResponse = await serviceGetWallets(req);
        res.status(200).json(jsonResponse);
    } catch (err) {
        next(err);
    }
};

module.exports = { createWallet, getWallets };
