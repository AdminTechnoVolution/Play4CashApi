const Joi = require('joi');
const { maxDecimals } = require('../../shared/util/util');
/**
 * @swagger
 * components:
 *   schemas:
 *     RechargeSchema:
 *       type: object
 *       required:
 *         - txId
 *         - amount
 *         - coin
 *       properties:
 *         txId:
 *           type: string
 *           example: 770cf33e00f78dc687e9157b95e89b395b9986f653d4e2282047567c3a49d2c0
 *         amount:
 *           type: number
 *           example: '10.0'
 *         coin:
 *           type: string
 *           example: usdt
*/
const rechargeSchema = Joi.object({
    txId: Joi.string().trim().required().messages({
        'any.required': 'txId.required',
        'string.empty': 'txId.required'
    }),
    amount: Joi.number().positive().custom(maxDecimals(10)).required().messages({
        'any.required': 'amount.required',
        'number.base': 'amount.invalid',
        'number.maxDecimals': 'amount.maxDecimals',
        'number.positive': 'amount.positive'
    }),
    coin: Joi.string().trim().max(15).required().messages({
        'any.required': 'coin.required',
        'number.base': 'coin.invalid',
        'string.max': 'coin.max'
    })
});

module.exports = { rechargeSchema };
