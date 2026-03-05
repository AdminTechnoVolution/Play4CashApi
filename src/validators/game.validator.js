const Joi = require('joi');

const languageSchema = Joi.object({
    es: Joi.string().trim().max(256).required()
        .messages({ 'any.required': 'name.es.required', 'string.empty': 'name.es.required' }),
    en: Joi.string().trim().max(256).required()
        .messages({ 'any.required': 'name.en.required', 'string.empty': 'name.en.required' }),
});

const languageDescriptionSchema = Joi.object({
    es: Joi.string().trim().max(2000).required()
        .messages({ 'any.required': 'description.es.required', 'string.empty': 'description.es.required' }),
    en: Joi.string().trim().max(2000).required()
        .messages({ 'any.required': 'description.en.required', 'string.empty': 'description.en.required' }),
});

/**
 * @swagger
 * components:
 *   schemas:
 *     CreateGameSchema:
 *       type: object
 *       required:
 *         - name
 *         - description
 *         - active
 *         - min_players
 *         - max_players
 *         - min_bet
 *         - default_bets
 *         - house_edge
 *         - socket_code
 *       properties:
 *         name:
 *           type: object
 *           properties:
 *             es: { type: string }
 *             en: { type: string }
 *         description:
 *           type: object
 *           properties:
 *             es: { type: string }
 *             en: { type: string }
 *         active:
 *           type: boolean
 *         min_players:
 *           type: number
 *         max_players:
 *           type: number
 *         min_bet:
 *           type: number
 *         default_bets:
 *           type: array
 *           items:
 *             type: number
 *         house_edge:
 *           type: number
 *           example: 5
 *         socket_code:
 *           type: string
 *           example: coin_flip
 *         turn_timer_seconds:
 *           type: number
 *           description: Seconds each player has per turn
 *           example: 30
*/
const createGameSchema = Joi.object({
    name: languageSchema.required(),
    description: languageDescriptionSchema.required(),
    active: Joi.boolean().required()
        .messages({ 'any.required': 'active.required' }),
    min_players: Joi.number().integer().min(1).required()
        .messages({ 'any.required': 'min_players.required' }),
    max_players: Joi.number().integer().min(1).required()
        .messages({ 'any.required': 'max_players.required' }),
    min_bet: Joi.number().min(0).required()
        .messages({ 'any.required': 'min_bet.required' }),
    default_bets: Joi.array().items(Joi.number().min(0)).min(1).required()
        .messages({ 'any.required': 'default_bets.required' }),
    house_edge: Joi.number().min(1).max(100).required()
        .messages({ 'any.required': 'house_edge.required' }),
    socket_code: Joi.string().trim().max(64).required()
        .messages({ 'any.required': 'socket_code.required', 'string.empty': 'socket_code.required' }),
    turn_timer_seconds: Joi.number().integer().min(1).required()
        .messages({ 'any.required': 'turn_timer_seconds.required' }),
});

/**
 * @swagger
 * components:
 *   schemas:
 *     UpdateGameSchema:
 *       type: object
 *       properties:
 *         name:
 *           type: object
 *           properties:
 *             es: { type: string }
 *             en: { type: string }
 *         description:
 *           type: object
 *           properties:
 *             es: { type: string }
 *             en: { type: string }
 *         active:
 *           type: boolean
 *         min_players:
 *           type: number
 *         max_players:
 *           type: number
 *         min_bet:
 *           type: number
 *         default_bets:
 *           type: array
 *           items:
 *             type: number
 *         house_edge:
 *           type: number
 *         socket_code:
 *           type: string
 *         turn_timer_seconds:
 *           type: number
 *           description: Seconds each player has per turn
*/
const updateGameSchema = Joi.object({
    name: Joi.object({
        es: Joi.string().trim().max(256),
        en: Joi.string().trim().max(256),
    }),
    description: Joi.object({
        es: Joi.string().trim().max(2000),
        en: Joi.string().trim().max(2000),
    }),
    active: Joi.boolean(),
    min_players: Joi.number().integer().min(1),
    max_players: Joi.number().integer().min(1),
    min_bet: Joi.number().min(0),
    default_bets: Joi.array().items(Joi.number().min(0)).min(1),
    house_edge: Joi.number().min(1).max(100),
    socket_code: Joi.string().trim().max(64),
    turn_timer_seconds: Joi.number().integer().min(1),
}).min(1).messages({ 'object.min': 'update.empty' });

module.exports = { createGameSchema, updateGameSchema };
