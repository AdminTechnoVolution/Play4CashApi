const Joi = require('joi');

/**
 * @swagger
 * components:
 *   schemas:
 *     CreateRoomSchema:
 *       type: object
 *       required:
 *         - game_id
 *         - bet_amount
 *         - public
 *       properties:
 *         game_id:
 *           type: string
 *           description: MongoDB ObjectId of the game
 *           example: 507f1f77bcf86cd799439011
 *         bet_amount:
 *           type: number
 *           description: Bet amount for this room (must be >= game min_bet and in default_bets)
 *           example: 10
 *         public:
 *           type: boolean
 *           description: Whether the room is publicly listed
 *           example: true
 *         name:
 *           type: string
 *           description: Optional custom room name
 *           example: "Friday Night Game"
*/
const createRoomSchema = Joi.object({
    game_id: Joi.string().trim().length(24).required()
        .messages({
            'any.required': 'game_id.required',
            'string.empty': 'game_id.required',
            'string.length': 'game_id.invalid'
        }),
    bet_amount: Joi.number().min(0).required()
        .messages({ 'any.required': 'bet_amount.required' }),
    public: Joi.boolean().required()
        .messages({ 'any.required': 'public.required' }),
    name: Joi.string().trim().max(64).optional(),
    player_limit: Joi.number().min(2).max(100).optional(), // New field
});

/**
 * @swagger
 * components:
 *   schemas:
 *     ReadyRoomSchema:
 *       type: object
 *       required:
 *         - ready
 *       properties:
 *         ready:
 *           type: boolean
 *           example: true
*/
const readyRoomSchema = Joi.object({
    ready: Joi.boolean().required()
        .messages({ 'any.required': 'ready.required' }),
});

module.exports = { createRoomSchema, readyRoomSchema };
