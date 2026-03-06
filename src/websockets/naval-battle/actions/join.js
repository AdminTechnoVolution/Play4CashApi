const jwt = require('../../../../shared/util/jwt');
const WsBaseResponse = require('../../../../shared/util/wsBaseResponse');
const i18n = require('../../../../shared/language/i18n');
const util = require('../../../../shared/util/util');
const logger = require('../../../../shared/config/logger');
const path = require('path');
const filename = path.basename(__filename);
const Joi = require('joi');
const Room = require('../../../models/room.model');
const BattleshipPlacement = require('../../../models/battleshipPlacement.model');

// Event name for all naval-battle messages on this socket
const EVENT = 'naval-battle';

const joinSchema = Joi.object({
    room_id: Joi.string().length(24).required(),
});

module.exports = (socket, namespace) => {
    socket.on('join', async (payload) => {
        let emitMsg;
        try {
            util.setLanguageToSocket(socket);

            // 1. Validate payload
            const { error } = joinSchema.validate(payload, { abortEarly: false });
            if (error) {
                emitMsg = WsBaseResponse.error({}, error.details.map(d => d.message));
                socket.emit(EVENT, emitMsg);
                socket.disconnect(true);
                return;
            }

            const { room_id } = payload;
            const player_id = jwt.getValueFromJwtToken(socket.handshake.query.token, 'id');

            // 2. Room must exist and be started
            const room = await Room.findById(room_id);
            if (!room) {
                emitMsg = WsBaseResponse.error({}, [i18n.__('ws.games.gameNotFound')]);
                socket.emit(EVENT, emitMsg);
                socket.disconnect(true);
                return;
            }

            if (room.status !== 'started') {
                emitMsg = WsBaseResponse.error({}, ['Room is not in started status.']);
                socket.emit(EVENT, emitMsg);
                socket.disconnect(true);
                return;
            }

            // 3. Player must be a member of the room
            const isMember = room.players.some(p => p.playerId.toString() === player_id);
            if (!isMember) {
                emitMsg = WsBaseResponse.error({}, [i18n.__('ws.games.notInRoom') || 'You are not a member of this room.']);
                socket.emit(EVENT, emitMsg);
                socket.disconnect(true);
                return;
            }

            // 4. Join the socket.io room
            socket.join(room_id);
            socket.data.player_id = player_id;
            socket.data.room_id = room_id;

            emitMsg = WsBaseResponse.success({ room_id }, [i18n.__('ws.games.waitingOpponent') || 'Joined room. Waiting for opponent.']);
            socket.emit(EVENT, emitMsg);

            logger.info(`Player ${player_id} joined naval-battle room ${room_id}`, { className: filename });

        } catch (err) {
            logger.error(`Error joining naval-battle room: ${err}`, { className: filename });
            emitMsg = WsBaseResponse.error({}, [i18n.__('ws.games.matchmakingError')]);
            socket.emit(EVENT, emitMsg);
        }
    });
};
