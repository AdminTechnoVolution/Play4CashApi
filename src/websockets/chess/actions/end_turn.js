const WsBaseResponse = require('../../../../shared/util/wsBaseResponse');
const i18n = require('../../../../shared/language/i18n');
const logger = require('../../../../shared/config/logger');
const path = require('path');
const filename = path.basename(__filename);
const Room = require('../../../models/room.model');
const ChessGame = require('../../../models/chessGame.model');
const { startTurnTimer, clearTurnTimer } = require('./timerUtils');

const EVENT = 'chess';

/**
 * end_turn — lets a player explicitly pass the turn to their opponent.
 */
module.exports = (socket, namespace) => {
    socket.on('end_turn', async () => {
        let emitMsg;
        try {
            const player_id = socket.data.player_id;
            const room_id   = socket.data.room_id;
            const playerNum = socket.data.playerNum;

            const room = await Room.findById(room_id).populate('game_id');
            if (!room || room.status !== 'started') {
                emitMsg = WsBaseResponse.error({}, [i18n.__('ws.games.roomInactive') || 'Room is no longer active.']);
                socket.emit(EVENT, emitMsg);
                return;
            }

            const game = await ChessGame.findOne({ room_id });
            if (!game) {
                emitMsg = WsBaseResponse.error({}, ['Game data not found.']);
                socket.emit(EVENT, emitMsg);
                return;
            }

            // Must be this player's turn relative to the DB
            if (game.current_player !== playerNum) {
                emitMsg = WsBaseResponse.error({}, [i18n.__('ws.games.notYourTurn') || 'It is not your turn.']);
                socket.emit(EVENT, emitMsg);
                return;
            }

            // Swap turns
            const nextPlayer = playerNum === 1 ? 2 : 1;
            game.current_player = nextPlayer;
            game.turn_start_time = new Date();
            await game.save();

            const timerSeconds = room.game_id?.turn_timer_seconds ?? 30;

            // 4. Notify everyone in the room and sync state
            const sockets = await namespace.in(room_id).fetchSockets();
            const opponentSocket = sockets.find(s => s.data.playerNum === nextPlayer);

            // Notify the current player (who just ended their turn)
            socket.data.myTurn = false;
            if (socket.save) await socket.save();

            socket.emit(EVENT, WsBaseResponse.success({
                board: game.board,
                yourTurn: false,
                outcome: '',
                turnTimerSeconds: timerSeconds,
                isPlayerOne: playerNum === 1,
                playingWhite: playerNum === 1
            }, ['Turn ended.']));

            // Notify the opponent (it's now their turn)
            socket.to(room_id).emit(EVENT, WsBaseResponse.success({
                board: game.board,
                yourTurn: true,
                outcome: '',
                turnTimerSeconds: timerSeconds,
                isPlayerOne: nextPlayer === 1,
                playingWhite: nextPlayer === 1
            }, ['Opponent ended their turn. Your turn!']));

            // Switch timers and update opponent's session-level turn flag
            if (opponentSocket) {
                opponentSocket.data.myTurn = true;
                if (opponentSocket.save) await opponentSocket.save();
                
                clearTurnTimer(socket); // clear for the player who just ended turn
                startTurnTimer(opponentSocket, socket, namespace, room_id, timerSeconds);
            }

            logger.info(`Chess: P${playerNum} ended turn in room ${room_id}`, { className: filename });

        } catch (err) {
            logger.error(`Error in chess end_turn: ${err}`, { className: filename });
            emitMsg = WsBaseResponse.error({}, ['Could not end turn. Please try again.']);
            socket.emit(EVENT, emitMsg);
        }
    });
};
