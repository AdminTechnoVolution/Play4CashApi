const Joi = require('joi');

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
    isActive: Joi.boolean().optional()
});

module.exports = { walletSchema };
