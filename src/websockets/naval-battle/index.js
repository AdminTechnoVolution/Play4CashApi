const jwt = require('../../../shared/util/jwt');
const WsBaseResponse = require('../../../shared/util/wsBaseResponse');
const logger = require('../../../shared/config/logger');
const path = require('path');
const filename = path.basename(__filename);
const Room = require('../../models/room.model');
const onJoin = require('./actions/join');
const onFire = require('./actions/fire');
const onDisconnect = require('./actions/disconnect');
const { startTurnTimer, clearTurnTimer } = require('./actions/timerUtils');

const EVENT = 'naval-battle';

module.exports = (socket, namespace) => {
    // Extract player identity from JWT on connection
    const player_id = jwt.getValueFromJwtToken(socket.handshake.query.token, 'id');
    socket.data.player_id = player_id;
    socket.data.myTurn = false;
    socket.data.turnTimer = null;

    // Wire event handlers
    onJoin(socket, namespace);
    onFire(socket, namespace);
    onDisconnect(socket, namespace);

    // After join.js processes the 'join' event, check if both players are in the room
    // and kick off the first turn timer
    socket.on('join', () => {
        setImmediate(async () => {
            try {
                const room_id = socket.data.room_id;
                if (!room_id) return;

                const playersInRoom = [...namespace.sockets.values()].filter(
                    s => s.data.room_id === room_id
                );

                if (playersInRoom.length !== 2) return; // Wait for both players

                // Load game to get turn_timer_seconds
                const room = await Room.findById(room_id).populate('game_id', 'turn_timer_seconds');
                const timerSeconds = room?.game_id?.turn_timer_seconds ?? 30;

                // Store timer duration on each socket for later use in fire.js
                playersInRoom[0].data.turnTimerSeconds = timerSeconds;
                playersInRoom[1].data.turnTimerSeconds = timerSeconds;

                // First player connected goes first
                const firstPlayer = playersInRoom[0];
                const secondPlayer = playersInRoom[1];

                firstPlayer.data.myTurn = true;
                secondPlayer.data.myTurn = false;

                // Notify both players
                firstPlayer.emit(EVENT, WsBaseResponse.success(
                    { yourTurn: true, turnTimerSeconds: timerSeconds },
                    ['Both players connected. Your turn — fire!']
                ));
                secondPlayer.emit(EVENT, WsBaseResponse.success(
                    { yourTurn: false, turnTimerSeconds: timerSeconds },
                    ['Both players connected. Waiting for opponent to fire.']
                ));

                // Start the timer for the first player
                startTurnTimer(firstPlayer, secondPlayer, namespace, room_id, timerSeconds);

                logger.info(
                    `Naval-battle room ${room_id} started. Player ${firstPlayer.data.player_id} goes first. Timer: ${timerSeconds}s`,
                    { className: filename }
                );
            } catch (err) {
                logger.error(`Error starting naval-battle game: ${err}`, { className: filename });
            }
        });
    });
};
