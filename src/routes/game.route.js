const express = require('express');
const router = express.Router();
const validateToken = require('../../shared/middlewares/validateToken');
const validateAdmin = require('../../shared/middlewares/validateAdmin');
const validateBody = require('../../shared/middlewares/validateBody');
const { createGameSchema, updateGameSchema } = require('../validators/game.validator');
const { getActiveGames, createGame, updateGame, deleteGame } = require('../controllers/game.controller');

/**
 * @swagger
 * /api/games:
 *   get:
 *     summary: Get all games
 *     tags:
 *       - Games
 *     security:
 *       - Bearer: []
 *     parameters:
 *       - in: header
 *         name: Authorization
 *         required: true
 *         schema:
 *           type: string
 *         example: Bearer eyJhbGciOi
 *       - in: header
 *         name: Accept-Language
 *         schema:
 *           type: string
 *         example: es
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal Server Error
 */
router.get('/', validateToken, getActiveGames);

/**
 * @swagger
 * /api/games:
 *   post:
 *     summary: Create a new game (admin only)
 *     tags:
 *       - Games
 *     security:
 *       - Bearer: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateGameSchema'
 *     responses:
 *       201:
 *         description: Created
 *       400:
 *         description: Bad Request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Internal Server Error
 */
router.post('/', validateToken, validateAdmin, validateBody(createGameSchema), createGame);

/**
 * @swagger
 * /api/games/{id}:
 *   patch:
 *     summary: Update a game (admin only)
 *     tags:
 *       - Games
 *     security:
 *       - Bearer: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Game ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateGameSchema'
 *     responses:
 *       200:
 *         description: Success
 *       400:
 *         description: Bad Request
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not Found
 *       500:
 *         description: Internal Server Error
 */
router.patch('/:id', validateToken, validateAdmin, validateBody(updateGameSchema), updateGame);

/**
 * @swagger
 * /api/games/{id}:
 *   delete:
 *     summary: Delete a game (admin only)
 *     tags:
 *       - Games
 *     security:
 *       - Bearer: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Game ID
 *     responses:
 *       200:
 *         description: Success
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not Found
 *       500:
 *         description: Internal Server Error
 */
router.delete('/:id', validateToken, validateAdmin, deleteGame);

module.exports = router;