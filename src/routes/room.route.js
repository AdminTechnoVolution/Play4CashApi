const express = require('express');
const router = express.Router();
const validateToken = require('../../shared/middlewares/validateToken');
const validateAdmin = require('../../shared/middlewares/validateAdmin');
const validateBody = require('../../shared/middlewares/validateBody');
const { createRoomSchema, readyRoomSchema } = require('../validators/room.validator');
const { getRooms, getRoom, getRoomStatus, createRoom, joinRoom, setReady, deleteRoom, leaveRoom } = require('../controllers/room.controller');

/**
 * @swagger
 * /api/rooms/{game_id}:
 *   get:
 *     summary: Get all waiting and started rooms for a game
 *     tags:
 *       - Rooms
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
 *         name: game_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Game ID to filter rooms by
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BaseResponse'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal Server Error
 */
router.get('/:game_id', validateToken, getRooms);

/**
 * @swagger
 * /api/rooms/{id}:
 *   get:
 *     summary: Get a single room by ID
 *     tags:
 *       - Rooms
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
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Room ID
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Not Found
 *       500:
 *         description: Internal Server Error
 */
router.get('/:id', validateToken, getRoom);

/**
 * @swagger
 * /api/rooms/{id}/status:
 *   get:
 *     summary: Get the current status of a room (status, player count, current turn)
 *     tags:
 *       - Rooms
 *     security:
 *       - Bearer: []
 *     parameters:
 *       - in: header
 *         name: Authorization
 *         required: true
 *         schema:
 *           type: string
 *         example: Bearer eyJhbGciOi
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Room ID
 *     responses:
 *       200:
 *         description: Success
 *       404:
 *         description: Room not found
 *       500:
 *         description: Internal Server Error
 */
router.get('/:id/status', validateToken, getRoomStatus);


/**
 * @swagger
 * /api/rooms:
 *   post:
 *     summary: Create a new room for a game
 *     tags:
 *       - Rooms
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateRoomSchema'
 *     responses:
 *       201:
 *         description: Created
 *       400:
 *         description: Bad Request (game not found or bet too low)
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal Server Error
 */
router.post('/', validateToken, validateBody(createRoomSchema), createRoom);

/**
 * @swagger
 * /api/rooms/{id}/join:
 *   post:
 *     summary: Join an existing room
 *     tags:
 *       - Rooms
 *     security:
 *       - Bearer: []
 *     parameters:
 *       - in: header
 *         name: Authorization
 *         required: true
 *         schema:
 *           type: string
 *         example: Bearer eyJhbGciOi
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Room ID
 *     responses:
 *       200:
 *         description: Joined successfully
 *       400:
 *         description: Room full, already in room, or not in waiting status
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Room not found
 *       500:
 *         description: Internal Server Error
 */
router.post('/:id/join', validateToken, joinRoom);

/**
 * @swagger
 * /api/rooms/{id}/leave:
 *   post:
 *     summary: Leave a room
 *     tags:
 *       - Rooms
 *     security:
 *       - Bearer: []
 *     parameters:
 *       - in: header
 *         name: Authorization
 *         required: true
 *         schema:
 *           type: string
 *         example: Bearer eyJhbGciOi
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Room ID
 *     responses:
 *       200:
 *         description: Left successfully
 *       400:
 *         description: Bad Request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Player not in room
 *       404:
 *         description: Room not found
 *       500:
 *         description: Internal Server Error
 */
router.post('/:id/leave', validateToken, leaveRoom);

/**
 * @swagger
 * /api/rooms/{id}/ready:
 *   patch:
 *     summary: Set the authenticated user's ready status in a room
 *     tags:
 *       - Rooms
 *     security:
 *       - Bearer: []
 *     parameters:
 *       - in: header
 *         name: Authorization
 *         required: true
 *         schema:
 *           type: string
 *         example: Bearer eyJhbGciOi
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Room ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ReadyRoomSchema'
 *     responses:
 *       200:
 *         description: Ready status updated
 *       400:
 *         description: Room not in waiting status
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Player not in room
 *       404:
 *         description: Room not found
 *       500:
 *         description: Internal Server Error
 */
router.patch('/:id/ready', validateToken, validateBody(readyRoomSchema), setReady);

/**
 * @swagger
 * /api/rooms/{id}:
 *   delete:
 *     summary: Delete a room (admin only)
 *     tags:
 *       - Rooms
 *     security:
 *       - Bearer: []
 *     parameters:
 *       - in: header
 *         name: Authorization
 *         required: true
 *         schema:
 *           type: string
 *         example: Bearer eyJhbGciOi
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Room ID
 *     responses:
 *       200:
 *         description: Deleted
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not Found
 *       500:
 *         description: Internal Server Error
 */
router.delete('/:id', validateToken, validateAdmin, deleteRoom);

module.exports = router;
