const Joi = require('joi');
const { PASSWORD_PATTERN, USERNAME_PATTERN } = require('../../shared/util/constants');

/**
 * @swagger
 * components:
 *   schemas:
 *     RegisterUserSchema:
 *       type: object
 *       required:
 *         - email
 *         - username
 *         - password
 *       properties:
 *         email:
 *           type: string
 *           example: johndoe@example.com
 *         username:
 *           type: string
 *           example: JhonDoe123
 *         password:
 *           type: string
 *           example: strongPassword123*
 *         referred_by:
 *           type: string
 *           example: 770cf33e00f78dc687e9157b95e89b395b9986f653d4e2282047567c3a49d2c0 
*/
const registerUserSchema = Joi.object({
    email: Joi.string().trim().max(256).email().required()
        .messages({
            'any.required': 'email.required',
            'string.empty': 'email.required',
            'string.max': 'email.max',
            'string.email': 'email.invalid'
        }),
    username: Joi.string().trim().max(64).pattern(new RegExp(USERNAME_PATTERN)).required()
        .messages({
            'any.required': 'username.required',
            'string.empty': 'username.required',
            'string.max': 'username.max',
            'string.pattern.base': 'username.pattern'
        }),
    password: Joi.string().trim().max(256).pattern(new RegExp(PASSWORD_PATTERN)).required()
        .messages({
            'any.required': 'password.required',
            'string.empty': 'password.required',
            'string.max': 'password.max',
            'string.pattern.base': 'password.pattern'
        }),
    referred_by: Joi.string().trim().length(64).optional()
        .messages({
            'string.length': 'referred_by.length',
        }),
});

/**
 * @swagger
 * components:
 *   schemas:
 *     VerifyCodeUserSchema:
 *       type: object
 *       required:
 *         - email
 *         - verification_code
 *       properties:
 *         email:
 *           type: string
 *           example: johndoe@example.com
 *         verification_code:
 *           type: string
 *           example: 123456
*/
const verifyCodeUserSchema = Joi.object({
    email: Joi.string().trim().max(256).email().required()
        .messages({
            'any.required': 'email.required',
            'string.empty': 'email.required',
            'string.max': 'email.max',
            'string.email': 'email.invalid'
        }),
    verification_code: Joi.string().trim().length(6).required()
        .messages({
            'any.required': 'verification_code.required',
            'string.empty': 'verification_code.required',
            'string.length': 'verification_code.length'
        })
});

/**
 * @swagger
 * components:
 *   schemas:
 *     RegisterWalletToUserSchema:
 *       type: object
 *       required:
 *         - wallet
 *         - coin
 *         - network
 *       properties:
 *         wallet:
 *           type: string
 *           example: TJcrbWEDKCG4FYgFKwgjDD4XJ7dLkjUiTE
 *         coin:
 *           type: string
 *           example: USDT
 *         network:
 *           type: string
 *           example: TRX
*/
const registerWalletToUserSchema = Joi.object({
    wallet: Joi.string().trim().max(256).required()
        .messages({
            'any.required': 'wallet.required',
            'string.empty': 'wallet.required',
            'string.max': 'wallet.max'
        }),
    coin: Joi.string().trim().max(15).required()
        .messages({
            'any.required': 'coin.required',
            'string.empty': 'coin.required',
            'string.max': 'coin.max'
        }),
    network: Joi.string().trim().max(15).required()
        .messages({
            'any.required': 'network.required',
            'string.empty': 'network.required',
            'string.max': 'network.max'
        })
});

module.exports = {
    registerUserSchema,
    verifyCodeUserSchema,
    registerWalletToUserSchema
};
