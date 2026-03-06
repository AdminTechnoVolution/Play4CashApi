const express = require('express');
const router = express.Router({ mergeParams: true });
const validateToken = require('../../shared/middlewares/validateToken');
const validateBody = require('../../shared/middlewares/validateBody');
const { battleshipPlacementSchema } = require('../validators/battleshipPlacement.validator');
const { savePlacement } = require('../controllers/battleshipPlacement.controller');

/**
 * @swagger
 * /api/rooms/{roomId}/battleship/placement:
 *   post:
 *     summary: Submit ship placements for a Battleship game room
 *     description: >
 *       Saves the authenticated player's ship positions for the given room.
 *       The player must be a member of the room and the room must be in 'waiting' status.
 *       Each player can only submit once per room.
 *     tags:
 *       - Battleship
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
 *       - in: path
 *         name: roomId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the room
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/BattleshipPlacementSchema'
 *     responses:
 *       201:
 *         description: Placement saved successfully. roomStatus will be 'started' if all players are now ready.
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/BaseResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         message:
 *                           type: string
 *                           example: Placement saved
 *                         status:
 *                           type: string
 *                           example: placed
 *                         roomStatus:
 *                           type: string
 *                           enum: [waiting, started]
 *                           example: started
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BaseResponse'
 *       403:
 *         description: Player is not a member of this room
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BaseResponse'
 *       404:
 *         description: Room not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BaseResponse'
 *       409:
 *         description: Player already submitted a placement for this room
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BaseResponse'
 *       500:
 *         description: Internal Server Error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BaseResponse'
 */
router.post('/', validateToken, validateBody(battleshipPlacementSchema), savePlacement);

module.exports = router;
