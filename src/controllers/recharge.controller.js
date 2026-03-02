const { ERROR_BAD_REQUEST_RESPONSE } = require('../../shared/util/constants');
const { createRecharge: serviceCreateRecharge } = require('../services/recharge.service');
const BusinessException = require('../../shared/exceptionHandler/BusinessException');

const createRecharge = async (req, res, next) => {
    try {
        if (!req.body) throw new BusinessException(ERROR_BAD_REQUEST_RESPONSE);

        let jsonResponse = await serviceCreateRecharge(req);
        res.status(200).json(jsonResponse);
    } catch (err) {
        next(err);
    }
};

module.exports = { createRecharge };
