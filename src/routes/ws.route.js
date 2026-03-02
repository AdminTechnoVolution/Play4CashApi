const express = require('express');
const router = express.Router();

/**
 * @swagger
 * /rps:
 *   get:
 *     tags:
 *       - Web Sockets
 *     summary: WebSocket API for RPS Game
 *     description: |
 *       **RPS Game WebSocket**
 *       - URL: `ws://localhost:3000/rps`
 *       - Protocol: JSON messages with `{ action, payload }`
 *       
 *       #### Supported Actions:
 *       | Action        | Payload Example                               | Description                   |
 *       |---------------|-----------------------------------------------|-------------------------------|
 *       | `joinRoom`    | `{ roomId: "abc", playerName: "Alice" }`      | Joins or creates a game room  |
 *       | `playerMove`  | `{ roomId: "abc", move: "rock" }`             | Sends a player’s move         |
 *       
 *       **Notes:**
 *       - All communication is JSON-based.
 */

router.get('/docs/ws/rps', (req, res) => {
    res.send('See Swagger UI for WebSocket documentation');
});

module.exports = router;