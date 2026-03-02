const Joi = require('joi');

/**
 * @swagger
 * components:
 *   schemas:
 *     RefreshTokenSchema:
 *       type: object
 *       required:
 *         - refreshToken
 *       properties:
 *         refreshToken:
 *           type: string
 *           example: eyJhbGciOi
*/
const refreshTokenSchema = Joi.object({
    refreshToken: Joi.string().trim().required()
        .messages({
            'any.required': 'refreshToken.required',
            'string.empty': 'refreshToken.required'
        })
});

/**
 * @swagger
 * components:
 *   schemas:
 *     LoginSchema:
 *       type: object
 *       required:
 *         - email
 *         - password
 *       properties:
 *         email:
 *           type: string
 *           example: johndoe@example.com
 *         password:
 *           type: string
 *           example: strongPassword123*
*/
const loginSchema = Joi.object({
    email: Joi.string().trim().max(256).email().required()
        .messages({
            'any.required': 'email.required',
            'string.empty': 'email.required',
            'string.max': 'email.max',
            'string.email': 'email.invalid'
        }),
    password: Joi.string().trim().max(256).required()
        .messages({
            'any.required': 'password.required',
            'string.empty': 'password.required',
            'string.max': 'password.max'
        })
});

module.exports = { loginSchema, refreshTokenSchema };
