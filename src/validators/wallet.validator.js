const Joi = require('joi');
const { maxDecimals } = require('../../shared/util/util');

/**
 * @swagger
 * components:
 *   schemas:
 *     WalletSchema:
 *       type: object
 *       required:
 *         - coin
 *         - address
 *         - red
 *       properties:
 *         coin:
 *           type: string
 *           example: usdt
 *         address:
 *           type: string
 *           example: 0x1234567890abcdef1234567890abcdef12345678
 *         red:
 *           type: string
 *           example: trc20
 *         description:
 *           type: string
 *           example: Main wallet for TRC20 deposits
 *         minAmount:
 *           type: number
 *           example: 0.5
 *         networkWithdrawalFee:
 *           type: number
 *           example: 0.8
 *         isActive:
 *           type: boolean
 *           example: true
 */
const walletSchema = Joi.object({
    coin: Joi.string().trim().max(15).required().messages({
        'any.required': 'coin.required',
        'string.empty': 'coin.required',
        'string.max': 'coin.max'
    }),
    address: Joi.string().trim().required().messages({
        'any.required': 'address.required',
        'string.empty': 'address.required'
    }),
    red: Joi.string().trim().required().messages({
        'any.required': 'red.required',
        'string.empty': 'red.required'
    }),
    description: Joi.string().trim().optional(),
    minAmount: Joi.number().min(0).custom(maxDecimals(10)).required().messages({
        'any.required': 'minAmount.required',
        'number.base': 'minAmount.invalid',
        'number.min': 'minAmount.min',
        'number.maxDecimals': 'minAmount.maxDecimals'
    }),
    networkWithdrawalFee: Joi.number().min(0).custom(maxDecimals(10)).required().messages({
        'any.required': 'networkWithdrawalFee.required',
        'number.base': 'networkWithdrawalFee.invalid',
        'number.min': 'networkWithdrawalFee.min',
        'number.maxDecimals': 'networkWithdrawalFee.maxDecimals'
    }),
    isActive: Joi.boolean().optional()
});

module.exports = { walletSchema };
