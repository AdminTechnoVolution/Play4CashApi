const path = require('path');
const logger = require('../config/logger');
const filename = path.basename(__filename);
const { ERROR_BAD_REQUEST_RESPONSE, ERROR_GENERIC_RESPONSE } = require('../../shared/util/constants');
const BaseResponse = require('../util/baseResponse');
const BusinessException = require('./BusinessException');

function exceptionHandler(err, req, res, next) {
    logger.error(`Ingresando a exceptionHandler. Error: ${err}`, { className: filename });
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
        let message = req.__(ERROR_BAD_REQUEST_RESPONSE)
        let response = new BaseResponse(false, message);
        return res.status(err.status).json(response);
    }

    if (err instanceof BusinessException) {
        let message = req.__(err.message)
        let response = new BaseResponse(false, [message]);
        return res.status(err.statusCode).json(response);
    }


    // NEVER expose raw error details to the client — log them server-side only
    logger.error(`Unhandled exception: ${err.stack || err}`, { className: filename });
    const statusCode = err.statusCode || 500;
    const message = req.__(ERROR_GENERIC_RESPONSE);
    const response = new BaseResponse(false, [message]);
    res.status(statusCode).json(response);
}

module.exports = exceptionHandler;
