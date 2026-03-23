const WsBaseResponse = require('../../../../shared/util/wsBaseResponse');
const logger = require('../../../../shared/config/logger');
const path = require('path');
const filename = path.basename(__filename);
const Room = require('../../../models/room.model');
const User = require('../../../models/user.model');
const i18n = require('../../../../shared/language/i18n');

const EVENT = 'halma';

/**
 * Starts the turn timer for the active player.
 * If the timer fires, the active player loses by timeout.
 */
const startTurnTimer = (activeSocket, opponentSocket, namespace, room_id, seconds) => {
    clearTurnTimer(activeSocket);

    activeSocket.data.turnStartTime = Date.now();
    activeSocket.data.turnTimerSeconds = seconds;
    activeSocket.data.turnTimer = setTimeout(async () => {
        try {
            logger.info(`Halma turn timeout: player ${activeSocket.data.player_id} in room ${room_id}`, { className: filename });

            const room = await Room.findById(room_id);
            if (!room || room.status !== 'started') return;

            const winner_id = opponentSocket.data.player_id;
            room.status = 'finished';
            room.winner = winner_id;
            room.winner_reason = 'timeout';
            room.finished_at = new Date();
            await room.save();

            const prize = room.bet_amount + (room.bet_amount * (1 - room.house_edge / 100));
            await User.findByIdAndUpdate(winner_id, { $inc: { balance: prize } });

            activeSocket.emit(EVENT, WsBaseResponse.error(
                { outcome: 'timeout_loss', gameEnded: true },
                [i18n.__('ws.games.timeoutLoss')]
            ));

            opponentSocket.emit(EVENT, WsBaseResponse.success(
                { outcome: 'win', reason: 'timeout', prize, gameEnded: true },
                [i18n.__('ws.games.timeoutWin')]
            ));

            const { getIo } = require('../../../../shared/config/ws');
            const io = getIo();
            if (io) {
                io.of('/rooms').emit('roomDeleted', { id: room_id });
            }

        } catch (err) {
            logger.error(`Error processing halma turn timeout: ${err}`, { className: filename });
        }
    }, seconds * 1000);
};

const clearTurnTimer = (socket) => {
    if (socket.data.turnTimer) {
        clearTimeout(socket.data.turnTimer);
        socket.data.turnTimer = null;
    }
};

module.exports = { startTurnTimer, clearTurnTimer };
