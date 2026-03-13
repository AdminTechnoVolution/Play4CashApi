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
const User = require('../../../models/user.model');

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
                return;
            }

            const { room_id } = payload;
            const player_id = jwt.getValueFromJwtToken(socket.data.token, 'id');

            // 2. Room must exist and be started
            const room = await Room.findById(room_id);
            if (!room) {
                emitMsg = WsBaseResponse.error({}, [i18n.__('ws.games.gameNotFound')]);
                socket.emit(EVENT, emitMsg);
                return;
            }

            if (room.status !== 'waiting' && room.status !== 'started') {
                emitMsg = WsBaseResponse.error({}, [i18n.__('ws.games.roomInactive') || 'Room is no longer active.']);
                socket.emit(EVENT, emitMsg);
                return;
            }

            // 3. Player must be a member of the room
            const isMember = room.players.some(p => p.playerId.toString() === player_id);
            if (!isMember) {
                emitMsg = WsBaseResponse.error({}, [i18n.__('ws.games.notInRoom') || 'You are not a member of this room.']);
                socket.emit(EVENT, emitMsg);
                return;
            }

            // 4. Join the socket.io room
            socket.join(room_id);
            socket.data.player_id = player_id;
            socket.data.room_id = room_id;

            emitMsg = WsBaseResponse.success({ room_id, waitingForOpponent: true }, [i18n.__('ws.games.waitingOpponent') || 'Joined room. Waiting for opponent.']);
            socket.emit(EVENT, emitMsg);

            logger.info(`Player ${player_id} joined naval-battle room ${room_id}`, { className: filename });

            // Fetch the joining player's username
            const joiningUser = await User.findById(player_id).select('username');
            const username = joiningUser ? joiningUser.username : 'Opponent';

            // Notify the already-waiting player(s) that their opponent just arrived
            const existingSockets = await namespace.in(room_id).fetchSockets();
            if (existingSockets.length > 1) {
                // Determine translation dynamically based on socket language setting
                const translatedMessage = i18n.__('ws.games.opponentJoined', { username }) 
                    || `${username} has joined the room!`;

                socket.to(room_id).emit(EVENT, WsBaseResponse.success(
                    { opponentJoined: true, opponentName: username },
                    [translatedMessage]
                ));
            }

            // Determine if the game is already started (e.g., reconnecting after both placed ships)
            if (room.status === 'started') {
                const roomObj = await Room.findById(room_id).populate('game_id', 'turn_timer_seconds');
                const timerSeconds = roomObj?.game_id?.turn_timer_seconds ?? 30;
                
                // Read from room object who's turn it is
                // (This assumes the first player in the room.players array goes first.
                // In a production app, you might track current_turn_player_id in the Room model).
                const isMyTurn = room.players[0].playerId.toString() === player_id;
                
                socket.data.turnTimerSeconds = timerSeconds;
                socket.data.myTurn = isMyTurn;

                emitMsg = WsBaseResponse.success(
                    { yourTurn: isMyTurn, turnTimerSeconds: timerSeconds, waitingForOpponent: false },
                    [isMyTurn 
                        ? (i18n.__('ws.games.opponentReady') || 'Reconnected. Your turn — fire!') 
                        : (i18n.__('ws.games.opponentReadyWait') || 'Reconnected. Waiting for opponent to fire.')]
                );
                socket.emit(EVENT, emitMsg);
            }

        } catch (err) {
            logger.error(`Error joining naval-battle room: ${err}`, { className: filename });
            emitMsg = WsBaseResponse.error({}, [i18n.__('ws.games.matchmakingError')]);
            socket.emit(EVENT, emitMsg);
        }
    });
};
