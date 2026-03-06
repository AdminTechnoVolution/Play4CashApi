const WsBaseResponse = require('../../../../shared/util/wsBaseResponse');
const i18n = require('../../../../shared/language/i18n');
const logger = require('../../../../shared/config/logger');
const path = require('path');
const filename = path.basename(__filename);

const EVENT = 'naval-battle';

module.exports = (socket, namespace) => {
    socket.on('disconnect', async () => {
        try {
            const { player_id, room_id } = socket.data;

            if (!room_id) return; // Never joined a room properly

            // Notify the opponent they won by forfeit
            const emitMsg = WsBaseResponse.error(
                { outcome: 'opponent_disconnected' },
                [i18n.__('ws.games.playerDisconnected') || 'Your opponent disconnected. You win!']
            );
            socket.to(room_id).emit(EVENT, emitMsg);

            logger.info(`Player ${player_id} disconnected from naval-battle room ${room_id}`, { className: filename });
        } catch (err) {
            logger.error(`Error in naval-battle disconnect: ${err}`, { className: filename });
        }
    });
};
