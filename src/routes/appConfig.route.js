const express = require('express');
const router = express.Router();
const { getConfig, updateConfig } = require('../controllers/appConfig.controller');
const validateToken = require('../../shared/middlewares/validateToken');
const validateAdmin = require('../../shared/middlewares/validateAdmin');

/**
 * @swagger
 * /api/config:
 *   get:
 *     summary: Get global app configuration (limits, etc.)
 *     tags:
 *       - Config
 *     responses:
 *       200:
 *         description: Success
 *       500:
 *         description: Internal Server Error
 */
router.get('/config', getConfig);

/**
 * @swagger
 * /api/config:
 *   put:
 *     summary: Update global app configuration (admin only)
 *     tags:
 *       - Config
 *     security:
 *       - Bearer: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               deposit_daily_limit:
 *                 type: number
 *               withdrawal_daily_limit:
 *                 type: number
 *     responses:
 *       200:
 *         description: Success
 *       400:
 *         description: Bad Request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal Server Error
 */
router.put('/config', validateToken, validateAdmin, updateConfig);

module.exports = router;
