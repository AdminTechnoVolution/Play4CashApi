const WsBaseResponse = require('../../../../shared/util/wsBaseResponse');
const logger = require('../../../../shared/config/logger');
const path = require('path');
const filename = path.basename(__filename);
const Room = require('../../../models/room.model');
const User = require('../../../models/user.model');
const i18n = require('../../../../shared/language/i18n');

const EVENT = 'naval-battle';

/**
 * Starts the turn timer for the active player.
 * If the timer fires, the active player loses by timeout.
 *
 * @param {Socket} activeSocket   - The socket whose turn it currently is
 * @param {Socket} opponentSocket - The opponent's socket
 * @param {SocketNamespace} namespace
 * @param {string} room_id
 * @param {number} seconds        - Seconds from game.turn_timer_seconds
 */
const startTurnTimer = (activeSocket, opponentSocket, namespace, room_id, seconds) => {
    // Clear any existing timer on the active socket first (safety net)
    clearTurnTimer(activeSocket);

    activeSocket.data.turnTimer = setTimeout(async () => {
        try {
            logger.info(
                `Turn timeout: player ${activeSocket.data.player_id} in room ${room_id}`,
                { className: filename }
            );

            // Mark room finished — opponent wins by timeout
            const room = await Room.findById(room_id);
            if (!room || room.status !== 'started') return;

            const winner_id = opponentSocket.data.player_id;
            room.status = 'finished';
            room.winner = winner_id;
            room.finished_at = new Date();
            await room.save();

            // Credit winner with prize
            const prize = room.bet_amount + (room.bet_amount * (1 - room.house_edge / 100));
            await User.findByIdAndUpdate(winner_id, { $inc: { balance: prize } });

            // Notify both players
            activeSocket.emit(EVENT, WsBaseResponse.error(
                { outcome: 'timeout_loss', gameEnded: true },
                [i18n.__('ws.games.timeoutLoss') || 'You ran out of time! You lose.']
            ));

            opponentSocket.emit(EVENT, WsBaseResponse.success(
                { outcome: 'win', reason: 'timeout', prize, gameEnded: true },
                [i18n.__('ws.games.timeoutWin') || 'Opponent ran out of time! You win!']
            ));
            
            // Notify the global lobby that this room is gone
            const { getIo } = require('../../../../shared/config/ws');
            const io = getIo();
            if (io) {
                io.of('/rooms').emit('roomDeleted', { id: room_id });
            }

        } catch (err) {
            logger.error(`Error processing turn timeout: ${err}`, { className: filename });
        }
    }, seconds * 1000);
};

/**
 * Clears the turn timer stored on a socket, if any.
 * @param {Socket} socket
 */
const clearTurnTimer = (socket) => {
    if (socket.data.turnTimer) {
        clearTimeout(socket.data.turnTimer);
        socket.data.turnTimer = null;
    }
};

module.exports = { startTurnTimer, clearTurnTimer };
