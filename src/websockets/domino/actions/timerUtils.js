const WsBaseResponse = require('../../../../shared/util/wsBaseResponse');
const logger = require('../../../../shared/config/logger');
const path = require('path');
const filename = path.basename(__filename);
const Room = require('../../../models/room.model');
const User = require('../../../models/user.model');
const i18n = require('../../../../shared/language/i18n');

const EVENT = 'domino';

/**
 * Starts the turn timer for the active player.
 */
const startTurnTimer = (activeSocket, allSockets, namespace, room_id, seconds) => {
    clearTurnTimer(activeSocket);

    activeSocket.data.turnStartTime = Date.now();
    activeSocket.data.turnTimerSeconds = seconds;
    activeSocket.data.turnTimer = setTimeout(async () => {
        try {
            logger.info(`Domino turn timeout: player ${activeSocket.data.player_id} in room ${room_id}`, { className: filename });

            const room = await Room.findById(room_id);
            if (!room || room.status !== 'started') return;

            // Find an opponent to award the win to (for now, just the first other player)
            const remainingPlayer = room.players.find(p => p.playerId.toString() !== activeSocket.data.player_id.toString());
            const winner_id = remainingPlayer ? remainingPlayer.playerId : null;

            if (!winner_id) return;

            room.status = 'finished';
            room.winner = winner_id;
            room.winner_reason = 'timeout';
            room.finished_at = new Date();
            await room.save();

            const prize = room.bet_amount * room.players.length * (1 - room.house_edge / 100);
            await User.findByIdAndUpdate(winner_id, { $inc: { balance: prize } });

            // Notify everyone
            allSockets.forEach(s => {
                if (s.data.player_id.toString() === activeSocket.data.player_id.toString()) {
                    s.emit(EVENT, WsBaseResponse.error(
                        { outcome: 'timeout_loss', winner: winner_id.toString(), reason: 'timeout', gameEnded: true },
                        [i18n.__('ws.games.timeoutLoss') || 'You ran out of time! You lose.']
                    ));
                } else if (s.data.player_id.toString() === winner_id.toString()) {
                    s.emit(EVENT, WsBaseResponse.success(
                        { outcome: 'win', winner: winner_id.toString(), reason: 'timeout', prize, gameEnded: true },
                        [i18n.__('ws.games.timeoutWin') || 'Opponent ran out of time! You win!']
                    ));
                } else {
                    s.emit(EVENT, WsBaseResponse.success(
                        { outcome: 'loss', winner: winner_id.toString(), reason: 'timeout', gameEnded: true },
                        [i18n.__('ws.games.lose') || 'Game ended by timeout.']
                    ));
                }
            });

            const { getIo } = require('../../../../shared/config/ws');
            const io = getIo();
            if (io) {
                io.of('/rooms').emit('roomDeleted', { id: room_id });
            }

        } catch (err) {
            logger.error(`Error processing domino turn timeout: ${err}`, { className: filename });
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
