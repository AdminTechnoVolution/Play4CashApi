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
 *         - token
 *       properties:
 *         token:
 *           type: string
 *           description: Google ID token obtained from the Google Sign-In button
 *           example: eyJhbGciOi...
*/
const loginSchema = Joi.object({
    token: Joi.string().trim().required()
        .messages({
            'any.required': 'token.required',
            'string.empty': 'token.required'
        })
});

module.exports = { loginSchema, refreshTokenSchema };
