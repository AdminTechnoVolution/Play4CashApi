const Joi = require('joi');
const { maxDecimals } = require('../../shared/util/util');

/**
 * @swagger
 * components:
 *   schemas:
 *     WithdrawalSchema:
 *       type: object
 *       required:
 *         - amount
 *       properties:
 *         amount:
 *           type: number
 *           example: '10.0'
*/
const withdrawalSchema = Joi.object({
    amount: Joi.number().positive().custom(maxDecimals(10)).required().messages({
        'any.required': 'amount.required',
        'number.base': 'amount.invalid',
        'number.maxDecimals': 'amount.maxDecimals',
        'number.positive': 'amount.positive'
    })
});

/**
 * @swagger
 * components:
 *   schemas:
 *     VerifyWithdrawalSchema:
 *       type: object
 *       required:
 *         - verification_code
 *       properties:
 *         verification_code:
 *           type: string
 *           example: '123456'
*/
const verifyWithdrawalSchema = Joi.object({
    verification_code: Joi.string().trim().length(6).required()
        .messages({
            'any.required': 'verification_code.required',
            'string.empty': 'verification_code.required',
            'string.length': 'verification_code.length'
        })
});

module.exports = { withdrawalSchema, verifyWithdrawalSchema };
