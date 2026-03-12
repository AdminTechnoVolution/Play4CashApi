const WsBaseResponse = require('../../../../shared/util/wsBaseResponse');
const i18n = require('../../../../shared/language/i18n');
const logger = require('../../../../shared/config/logger');
const path = require('path');
const filename = path.basename(__filename);
const Room = require('../../../models/room.model');

const EVENT = 'naval-battle';

module.exports = (socket, namespace) => {
    socket.on('disconnect', async () => {
        try {
            const { player_id, room_id } = socket.data;

            if (!room_id) return; // Never joined a room properly

            // Verify if the game is still actually running
            const room = await Room.findById(room_id);
            if (!room || room.status === 'finished') {
                logger.info(`Player ${player_id} disconnected from finished room ${room_id}`, { className: filename });
                return; // Game already ended normally, ignore disconnect
            }

            // Game was still running, so notify the opponent they won by forfeit
            const emitMsg = WsBaseResponse.error(
                { outcome: 'opponent_disconnected', gameEnded: true },
                [i18n.__('ws.games.playerDisconnected') || 'Your opponent disconnected. You win by forfeit!']
            );
            socket.to(room_id).emit(EVENT, emitMsg);

            logger.info(`Player ${player_id} forfeit by disconnecting from naval-battle room ${room_id}`, { className: filename });
        } catch (err) {
            logger.error(`Error in naval-battle disconnect: ${err}`, { className: filename });
        }
    });
};
