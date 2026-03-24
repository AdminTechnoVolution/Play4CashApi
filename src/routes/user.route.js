const express = require('express');
const router = express.Router();
const { registerUserSchema, verifyCodeUserSchema, registerWalletToUserSchema } = require('../validators/user.validator');
const validateBody = require('../../shared/middlewares/validateBody');
const validateToken = require('../../shared/middlewares/validateToken');
const validateAdmin = require('../../shared/middlewares/validateAdmin');
const { registerUser, verifyCodeUser, registerWalletToUser, getUserAccount, getUserHistory, getTotalBalances } = require('../controllers/user.controller');

/**
 * @swagger
 * /api/user/admin/total-balances:
 *   get:
 *     summary: Get total balance held by all users (Admin only)
 *     tags:
 *       - Admin
 *     security:
 *       - Bearer: []
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     total_balances:
 *                       type: number
 *                     total_deposited:
 *                       type: number
 *                     total_withdrawn:
 *                       type: number
 *                     total_users:
 *                       type: number
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Non-admin)
 *       500:
 *         description: Internal Server Error
 */
router.get('/admin/total-balances', validateToken, validateAdmin, getTotalBalances);

/**
 * @swagger
 * /api/user/account:
 *   get:
 *     summary: Get user account and information
 *     tags:
 *       - User
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
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserAccountResponse'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal Server Error
 */
router.get('/account', validateToken, getUserAccount);

/**
 * @swagger
 * /api/user/history:
 *   get:
 *     summary: Get user's game history
 *     tags:
 *       - User
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
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserHistoryResponse'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal Server Error
 */
router.get('/history', validateToken, getUserHistory);

/**
 * @swagger
 * /api/user/register:
 *   post:
 *     summary: Register new user
 *     tags:
 *       - User
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterUserSchema'
 *     responses:
 *       200:
 *         description: Success
 *       400:
 *         description: Bad Request
 *       500:
 *         description: Internal Server Error
 */
router.post('/register', validateBody(registerUserSchema), registerUser);

/**
 * @swagger
 * /api/user/register-wallet:
 *   post:
 *     summary: Register the wallet to the user
 *     tags:
 *       - User
 *     security:
 *       - Bearer: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterWalletToUserSchema'
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
router.post('/register-wallet', validateToken, validateBody(registerWalletToUserSchema), registerWalletToUser);

/**
 * @swagger
 * /api/user/verify-code:
 *   post:
 *     summary: Verify the code to complete the new user registration
 *     tags:
 *       - User
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/VerifyCodeUserSchema'
 *     responses:
 *       200:
 *         description: Success
 *       400:
 *         description: Bad Request
 *       500:
 *         description: Internal Server Error
 */
router.post('/verify-code', validateBody(verifyCodeUserSchema), verifyCodeUser);

module.exports = router;