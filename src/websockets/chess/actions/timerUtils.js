const WsBaseResponse = require('../../../../shared/util/wsBaseResponse');
const logger = require('../../../../shared/config/logger');
const path = require('path');
const filename = path.basename(__filename);
const Room = require('../../../models/room.model');
const User = require('../../../models/user.model');
const i18n = require('../../../../shared/language/i18n');

const EVENT = 'chess';

const startTurnTimer = (activeSocket, opponentSocket, namespace, room_id, seconds) => {
    clearTurnTimer(activeSocket);

    activeSocket.data.turnStartTime = Date.now();
    activeSocket.data.turnTimerSeconds = seconds;
    activeSocket.data.turnTimer = setTimeout(async () => {
        try {
            logger.info(`Chess turn timeout: player ${activeSocket.data.player_id} in room ${room_id}`, { className: filename });

            const room = await Room.findById(room_id);
            if (!room || room.status !== 'started') {
                logger.info(`Chess turn timeout: Room ${room_id} not found or already finished. Status: ${room?.status}`, { className: filename });
                return;
            }

            // Fix: Fetch winner_id from room document to avoid stale socket data
            const winner_id = room.players.find(p => p.playerId.toString() !== activeSocket.data.player_id.toString())?.playerId;
            
            if (!winner_id) {
                logger.error(`Chess turn timeout: winner_id not found for p:${activeSocket.data.player_id} in room ${room_id}`, { className: filename });
                return;
            }

            room.status = 'finished';
            room.winner = winner_id;
            room.winner_reason = 'timeout';
            room.finished_at = new Date();
            await room.save();

            const prize = room.bet_amount + (room.bet_amount * (1 - room.house_edge / 100));
            logger.info(`Chess turn timeout: awarding prize ${prize} to winner ${winner_id}`, { className: filename });
            await User.findByIdAndUpdate(winner_id, { $inc: { balance: prize } });

            activeSocket.emit(EVENT, WsBaseResponse.error(
                { outcome: 'timeout_loss', gameEnded: true },
                [i18n.__('ws.games.timeoutLoss')]
            ));

            if (opponentSocket && opponentSocket.connected) {
                opponentSocket.emit(EVENT, WsBaseResponse.success(
                    { outcome: 'win', reason: 'timeout', prize, gameEnded: true },
                    [i18n.__('ws.games.timeoutWin')]
                ));
            }

            const { getIo } = require('../../../../shared/config/ws');
            const io = getIo();
            if (io) {
                io.of('/rooms').emit('roomDeleted', { id: room_id });
            }

        } catch (err) {
            logger.error(`Error processing chess turn timeout: ${err}`, { className: filename });
        }
    }, seconds * 1000);
};

const clearTurnTimer = (socket) => {
    if (socket.data && socket.data.turnTimer) {
        clearTimeout(socket.data.turnTimer);
        socket.data.turnTimer = null;
    }
};

module.exports = { startTurnTimer, clearTurnTimer };
