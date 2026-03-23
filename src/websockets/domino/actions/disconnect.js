const Room = require('../../../models/room.model');
const DominoGame = require('../../../models/dominoGame.model');
const User = require('../../../models/user.model');
const WsBaseResponse = require('../../../../shared/util/wsBaseResponse');
const logger = require('../../../../shared/config/logger');
const i18n = require('../../../../shared/language/i18n');
const path = require('path');
const filename = path.basename(__filename);
const { clearTurnTimer } = require('./timerUtils');

const EVENT = 'domino';

module.exports = (socket, namespace) => {
    socket.on('disconnect', async (reason) => {
        const player_id = socket.data.player_id;
        const room_id = socket.data.room_id;

        if (!player_id || !room_id) return;

        logger.info(`Domino Disconnect: Handler triggered for reason: ${reason}`, { className: filename });
        logger.info(`Domino Disconnect: Processing disconnect for player ${player_id} in room ${room_id}`, { className: filename });

        try {
            const room = await Room.findById(room_id);
            if (!room || room.status !== 'started') {
                logger.info(`Domino Disconnect: Room ${room_id} not found or already finished. Status: ${room?.status}`, { className: filename });
                return;
            }

            // Award win to the remaining player(s)
            // For simplicity, we award to the first found opponent
            const opponent = room.players.find(p => p.playerId.toString() !== player_id.toString());
            const winner_id = opponent ? opponent.playerId : null;

            if (!winner_id) {
                logger.error(`Domino Disconnect: No opponent found to award win in room ${room_id}`, { className: filename });
                return;
            }

            room.status = 'finished';
            room.winner = winner_id;
            room.winner_reason = 'opponent_disconnect';
            room.finished_at = new Date();
            await room.save();

            const prize = room.bet_amount * room.players.length * (1 - room.house_edge / 100);
            await User.findByIdAndUpdate(winner_id, { $inc: { balance: prize } });

            // Notify remaining players
            namespace.in(room_id).emit(EVENT, WsBaseResponse.success(
                { outcome: 'win', winner: winner_id.toString(), reason: 'opponent_disconnect', prize, gameEnded: true },
                [i18n.__('ws.games.playerDisconnected') || 'Opponent disconnected. You win!']
            ));

            const game = await DominoGame.findOne({ room_id });
            if (game) {
                game.status = 'finished';
                await game.save();
            }

            // Cleanup timers
            clearTurnTimer(socket);

            const { getIo } = require('../../../../shared/config/ws');
            const io = getIo();
            if (io) {
                io.of('/rooms').emit('roomDeleted', { id: room_id });
            }

            logger.info(`Domino Disconnect: Room ${room_id} finished. Winner: ${winner_id}`, { className: filename });

        } catch (err) {
            logger.error(`Error in Domino disconnect: ${err}`, { className: filename });
        }
    });
};
