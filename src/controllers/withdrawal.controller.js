const { ERROR_BAD_REQUEST_RESPONSE } = require('../../shared/util/constants');
const BusinessException = require('../../shared/exceptionHandler/BusinessException');
const {
    createWithdrawal: serviceCreateWithdrawal,
    verifyWithdrawal: serviceVerifyWithdrawal
} = require('../services/withdrawal.service');

const createWithdrawal = async (req, res, next) => {
    try {
        if (!req.body) throw new BusinessException(ERROR_BAD_REQUEST_RESPONSE);

        let jsonResponse = await serviceCreateWithdrawal(req);
        res.status(200).json(jsonResponse);
    } catch (err) {
        next(err);
    }
};

const verifyWithdrawal = async (req, res, next) => {
    try {
        if (!req.body) throw new BusinessException(ERROR_BAD_REQUEST_RESPONSE);

        let jsonResponse = await serviceVerifyWithdrawal(req);
        res.status(200).json(jsonResponse);
    } catch (err) {
        next(err);
    }
};

module.exports = { createWithdrawal, verifyWithdrawal };