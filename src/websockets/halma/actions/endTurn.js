const WsBaseResponse = require('../../../../shared/util/wsBaseResponse');
const i18n = require('../../../../shared/language/i18n');
const logger = require('../../../../shared/config/logger');
const path = require('path');
const filename = path.basename(__filename);
const Room = require('../../../models/room.model');
const HalmaGame = require('../../../models/halmaGame.model');
const { startTurnTimer, clearTurnTimer } = require('./timerUtils');

const EVENT = 'halma';

/**
 * end_turn — lets a player voluntarily end their turn during a chain jump.
 * Chain jumps in Halma are optional ("may"), so after each jump the player
 * may either emit another 'move' OR emit 'end_turn' to pass the turn.
 */
module.exports = (socket, namespace) => {
    socket.on('end_turn', async () => {
        let emitMsg;
        try {
            const player_id = socket.data.player_id;
            const room_id   = socket.data.room_id;
            const playerNum = socket.data.playerNum;

            // Must be this player's turn
            if (!socket.data.myTurn) {
                emitMsg = WsBaseResponse.error({}, [i18n.__('ws.games.notYourTurn') || 'It is not your turn.']);
                socket.emit(EVENT, emitMsg);
                return;
            }

            // Room must be active
            const room = await Room.findById(room_id);
            if (!room || room.status !== 'started') {
                emitMsg = WsBaseResponse.error({}, [i18n.__('ws.games.roomInactive') || 'Room is no longer active.']);
                socket.emit(EVENT, emitMsg);
                return;
            }

            // Load current board so both players can re-render
            const game = await HalmaGame.findOne({ room_id });

            // Clear chain-jump lock and timer for current player
            socket.data.jumpingPiece = null;
            clearTurnTimer(socket);

            // Swap turns in DB
            const nextPlayer = playerNum === 1 ? 2 : 1;
            if (game) {
                game.current_player = nextPlayer;
                game.turn_start_time = new Date();
                await game.save();
            }

            // Record move in Room players history
            await Room.updateOne(
                { _id: room_id, 'players.playerId': player_id },
                { $push: { 'players.$.moves': { data: { type: 'end_turn' } } } }
            );

            socket.data.myTurn = false;

            const timerSeconds = socket.data.turnTimerSeconds ?? 30;

            // Confirm turn ended to the current player
            socket.emit(EVENT, WsBaseResponse.success({
                board: game ? game.board : null,
                yourTurn: false,
                turnTimerSeconds: timerSeconds,
                outcome: '',
                isPlayerOne: playerNum === 1,
            }, ['Turn ended.']));


            // Notify OPPONENT using socket.to() — guaranteed delivery to all
            // others in the room, regardless of how fetchSockets() behaves.
            const opponentPlayerNum = nextPlayer;


            socket.to(room_id).emit(EVENT, WsBaseResponse.success({
                board: game ? game.board : null,
                yourTurn: true,
                turnTimerSeconds: timerSeconds,
                outcome: '',
                isPlayerOne: opponentPlayerNum === 1,
            }, ["Opponent ended their turn. Your turn!"]));

            // Also update myTurn flag on the real opponent socket and start timer
            const socketsInRoom = await namespace.in(room_id).fetchSockets();
            const opponentSocket = socketsInRoom.find(s => s.data.player_id !== player_id) ?? null;

            if (opponentSocket) {
                opponentSocket.data.myTurn = true;
                startTurnTimer(opponentSocket, socket, namespace, room_id, timerSeconds);
            }

            logger.info(`Halma: P${playerNum} voluntarily ended turn in room ${room_id}`, { className: filename });

        } catch (err) {
            logger.error(`Error in halma end_turn: ${err}`, { className: filename });
            emitMsg = WsBaseResponse.error({}, ['Could not end turn. Please try again.']);
            socket.emit(EVENT, emitMsg);
        }
    });
};
