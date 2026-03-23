const jwt = require('../../../../shared/util/jwt');
const WsBaseResponse = require('../../../../shared/util/wsBaseResponse');
const i18n = require('../../../../shared/language/i18n');
const util = require('../../../../shared/util/util');
const logger = require('../../../../shared/config/logger');
const path = require('path');
const filename = path.basename(__filename);
const Joi = require('joi');
const Room = require('../../../models/room.model');
const ChessGame = require('../../../models/chessGame.model');
const User = require('../../../models/user.model');
const { getLegalMoves, applyMove, getGameResult, isCheck, COLORS } = require('./gameLogic');
const { startTurnTimer, clearTurnTimer } = require('./timerUtils');

const EVENT = 'chess';

const moveSchema = Joi.object({
    room_id: Joi.string().length(24).required(),
    from: Joi.object({ row: Joi.number().min(0).max(7).required(), col: Joi.number().min(0).max(7).required() }).required(),
    to: Joi.object({ row: Joi.number().min(0).max(7).required(), col: Joi.number().min(0).max(7).required() }).required(),
    promotion: Joi.string().valid('q', 'r', 'b', 'n').optional()
});

module.exports = (socket, namespace) => {
    socket.on('move', async (payload) => {
        try {
            util.setLanguageToSocket(socket);

            const { error } = moveSchema.validate(payload);
            if (error) {
                return socket.emit(EVENT, WsBaseResponse.error({}, error.details.map(d => d.message)));
            }

            const { room_id, from, to, promotion } = payload;
            const player_id = jwt.getValueFromJwtToken(socket.data.token, 'id');

            const game = await ChessGame.findOne({ room_id });
            if (!game) {
                return socket.emit(EVENT, WsBaseResponse.error({}, [i18n.__('ws.games.gameNotFound') || 'Game not found.']));
            }

            // 1. Validate turn
            const playerNum = socket.data.playerNum;
            if (game.current_player !== playerNum) {
                return socket.emit(EVENT, WsBaseResponse.error({}, [i18n.__('ws.games.notYourTurn') || 'Not your turn.']));
            }

            // 2. Validate move legality
            const legalMoves = getLegalMoves(from.row, from.col, game.board, game.toObject());
            const move = legalMoves.find(m => m.to.row === to.row && m.to.col === to.col);

            if (!move) {
                return socket.emit(EVENT, WsBaseResponse.error({
                    board: game.board,
                    yourTurn: true,
                    mustEndTurn: false,
                    isPlayerOne: playerNum === 1,
                    playingWhite: playerNum === 1
                }, [i18n.__('ws.games.illegalMove') || 'Illegal move.']));
            }

            if (promotion) move.promotion = promotion;

            // 3. Apply move
            const { nextBoard, nextState } = applyMove(move, game.board, game.toObject());
            
            // Check for game result
            const result = getGameResult(nextBoard, nextState);

            // Update database
            game.board = nextBoard;
            game.current_player = nextState.current_player;
            game.castling_rights = nextState.castling_rights;
            game.en_passant_target = nextState.en_passant_target;
            game.history.push({ from, to, piece: game.board[to.row][to.col], moveType: move.castle ? 'castle' : (move.enPassant ? 'enPassant' : 'normal') });
            game.turn_start_time = nextState.turn_start_time;
            
            // Record move in Room players history (persistent across games)
            await Room.updateOne(
                { _id: room_id, 'players.playerId': player_id },
                { $push: { 'players.$.moves': { data: { from, to, type: move.castle ? 'castle' : (move.enPassant ? 'enPassant' : 'normal') } } } }
            );

            if (result.finished) {
                const room = await Room.findById(room_id);
                room.status = 'finished';
                room.winner_reason = result.reason;
                room.finished_at = new Date();

                if (result.winner) {
                    const winner_id = result.winner === 1 ? game.player1_id : game.player2_id;
                    room.winner = winner_id;
                    const prize = room.bet_amount + (room.bet_amount * (1 - room.house_edge / 100));
                    await User.updateOne({ _id: winner_id }, { $inc: { balance: prize } });
                }
                await room.save();
                clearTurnTimer(socket);
            }
            
            await game.save();

            // 4. Emit updates and switch timers
            const timerSeconds = (await Room.findById(room_id).populate('game_id')).game_id?.turn_timer_seconds ?? 30;
            const sockets = await namespace.in(room_id).fetchSockets();
            const opponentSocket = sockets.find(s => s.data.playerNum !== playerNum);

            // Notify the current player (mover)
            socket.data.myTurn = true; // Turn stays with mover until end_turn
            if (socket.save) await socket.save();

            const moveAcceptedMsg = isCheck(playerNum === 1 ? 'w' : 'b', nextBoard, nextState) 
                ? i18n.__('ws.games.check')
                : i18n.__('ws.games.moveAccepted');

            socket.emit(EVENT, WsBaseResponse.success({
                board: nextBoard,
                lastMove: { from, to },
                yourTurn: true,
                mustEndTurn: !result.finished,
                outcome: result.finished ? (result.winner ? (result.winner === playerNum ? 'win' : 'lose') : 'draw') : '',
                turnTimerSeconds: timerSeconds,
                gameEnded: result.finished,
                winner: result.winner,
                youWon: result.finished ? (result.winner === playerNum) : undefined,
                reason: result.reason,
                isPlayerOne: playerNum === 1,
                playingWhite: playerNum === 1
            }, [result.finished ? (result.winner ? (result.winner === playerNum ? i18n.__('ws.games.win') : i18n.__('ws.games.lose')) : i18n.__({phrase: `ws.games.${result.reason}`})) : moveAcceptedMsg]));

            // Notify the opponent
            socket.to(room_id).emit(EVENT, WsBaseResponse.success({
                board: nextBoard,
                lastMove: { from, to },
                yourTurn: false,
                outcome: result.finished ? (result.winner ? (result.winner !== playerNum ? 'win' : 'lose') : 'draw') : '',
                turnTimerSeconds: timerSeconds,
                gameEnded: result.finished,
                winner: result.winner,
                youWon: result.finished ? (result.winner !== playerNum) : undefined,
                reason: result.reason,
                isPlayerOne: playerNum !== 1,
                playingWhite: playerNum !== 1
            }, [result.finished ? (result.winner ? (result.winner !== playerNum ? i18n.__('ws.games.win') : i18n.__('ws.games.lose')) : i18n.__({phrase: `ws.games.${result.reason}`})) : i18n.__('ws.games.opponentMoved')]));

            if (result.finished) {
                clearTurnTimer(socket);
                if (opponentSocket) clearTurnTimer(opponentSocket);

                const { getIo } = require('../../../../shared/config/ws');
                const io = getIo();
                if (io) io.of('/rooms').emit('roomDeleted', { id: room_id });
            }


        } catch (err) {
            logger.error(`Error in chess move: ${err}`, { className: filename });
            socket.emit(EVENT, WsBaseResponse.error({}, ['Error processing move.']));
        }
    });
};
