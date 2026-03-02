const express = require('express');
const router = express.Router();
const { createRecharge } = require('../controllers/recharge.controller');
const { rechargeSchema } = require('../validators/recharge.validator');
const validateBody = require('../../shared/middlewares/validateBody');
const validateToken = require('../../shared/middlewares/validateToken');

/**
 * @swagger
 * /api/transactions/recharge:
 *   post:
 *     summary: Create new recharge. This will be added to the user's balance
 *     tags:
 *       - Transactions
 *     security:
 *       - Bearer: []
 *     parameters:
 *       - in: header
 *         name: Authorization
 *         required: true
 *         schema:
 *           type: string
 *         description: Authorization token
 *         example: Bearer eyJhbGciOi
 *       - in: header
 *         name: Accept-Language
 *         schema:
 *           type: string
 *         description: Language to response
 *         example: es
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RechargeSchema'
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BaseResponse'
 *       400:
 *         description: Bad Request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/BaseResponse'
 *       401:
 *         description: Unauthorized
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
router.post('/recharge', validateToken, validateBody(rechargeSchema), createRecharge);

module.exports = router;