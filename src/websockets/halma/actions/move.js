const WsBaseResponse = require('../../../../shared/util/wsBaseResponse');
const i18n = require('../../../../shared/language/i18n');
const logger = require('../../../../shared/config/logger');
const path = require('path');
const filename = path.basename(__filename);
const Joi = require('joi');
const Room = require('../../../models/room.model');
const HalmaGame = require('../../../models/halmaGame.model');
const User = require('../../../models/user.model');
const { isValidStep, isValidJump, canJumpFurther, checkWin, createInitialBoard, isInGoalZone } = require('./gameUtils');
const { startTurnTimer, clearTurnTimer } = require('./timerUtils');

const EVENT = 'halma';

const moveSchema = Joi.object({
    from_row: Joi.number().integer().min(0).max(7).required(),
    from_col: Joi.number().integer().min(0).max(7).required(),
    to_row:   Joi.number().integer().min(0).max(7).required(),
    to_col:   Joi.number().integer().min(0).max(7).required(),
});

module.exports = (socket, namespace) => {
    socket.on('move', async (payload) => {
        let emitMsg;
        try {
            // 1. Validate payload shape
            const { error } = moveSchema.validate(payload, { abortEarly: false });
            if (error) {
                emitMsg = WsBaseResponse.error({}, error.details.map(d => d.message));
                socket.emit(EVENT, emitMsg);
                return;
            }

            const { from_row: fr, from_col: fc, to_row: tr, to_col: tc } = payload;
            const player_id = socket.data.player_id;
            const room_id   = socket.data.room_id;
            const playerNum = socket.data.playerNum; // 1 or 2

            // 2. Must be this player's turn
            if (!socket.data.myTurn) {
                emitMsg = WsBaseResponse.error({}, [i18n.__('ws.games.notYourTurn') || 'It is not your turn.']);
                socket.emit(EVENT, emitMsg);
                return;
            }

            // 3. Room must be active
            const room = await Room.findById(room_id);
            if (!room || room.status !== 'started') {
                emitMsg = WsBaseResponse.error({}, [i18n.__('ws.games.roomInactive') || 'Room is no longer active.']);
                socket.emit(EVENT, emitMsg);
                return;
            }

            // 4. Load game state (create on first move if missing)
            let game = await HalmaGame.findOne({ room_id });
            if (!game) {
                const player1_id = room.players[0].playerId;
                const player2_id = room.players[1].playerId;
                game = new HalmaGame({
                    room_id,
                    player1_id,
                    player2_id,
                    board: createInitialBoard(),
                    current_player: 1,
                });
                await game.save();
            }

            const board = game.board.map(row => [...row]); // deep copy for mutation

            // 5. The piece being moved must belong to this player
            if (board[fr][fc] !== playerNum) {
                emitMsg = WsBaseResponse.error({}, ['That piece does not belong to you.']);
                socket.emit(EVENT, emitMsg);
                return;
            }

            // 6a. Optional config: prevent pieces from leaving the goal zone once entered
            if (game.prevent_leave_goal && isInGoalZone(fr, playerNum) && !isInGoalZone(tr, playerNum)) {
                emitMsg = WsBaseResponse.error({}, ['Pieces cannot leave the target zone once entered.']);
                socket.emit(EVENT, emitMsg);
                return;
            }

            // 6b. Chain-jump enforcement — if we're mid-chain, only the jumping piece can move
            const jumping = socket.data.jumpingPiece; // { row, col } or null
            if (jumping && (fr !== jumping.row || fc !== jumping.col)) {
                emitMsg = WsBaseResponse.error({}, ['You must continue jumping with the same piece.']);
                socket.emit(EVENT, emitMsg);
                return;
            }

            // 7. Classify the move
            const dr = Math.abs(tr - fr);
            const dc = Math.abs(tc - fc);
            const isStep = dr <= 1 && dc <= 1;
            const isJump = isValidJump(board, fr, fc, tr, tc);

            // Mid-chain: only jumps allowed (no steps)
            if (jumping && isStep && !isJump) {
                emitMsg = WsBaseResponse.error({}, ['You must jump — you cannot step while in a chain jump.']);
                socket.emit(EVENT, emitMsg);
                return;
            }

            // Validate
            if (isStep && !jumping) {
                if (!isValidStep(board, fr, fc, tr, tc, playerNum)) {
                    emitMsg = WsBaseResponse.error({}, ['Invalid step move.']);
                    socket.emit(EVENT, emitMsg);
                    return;
                }
            } else if (isJump) {
                // already validated inside isValidJump
            } else {
                emitMsg = WsBaseResponse.error({}, ['Invalid move.']);
                socket.emit(EVENT, emitMsg);
                return;
            }

            // 8. Apply the move
            board[tr][tc] = board[fr][fc];
            board[fr][fc] = 0;

            // 9. Record move in Room.players[].moves (generic cross-game history)
            const moveIndex = room.players.find(p => p.playerId.toString() === player_id)?.moves?.length ?? 0;
            await Room.updateOne(
                { _id: room_id, 'players.playerId': player_id },
                { $push: { 'players.$.moves': { data: { fr, fc, tr, tc, type: isJump ? 'jump' : 'step' } } } }
            );

            // 11. Calculate remaining time for the current turn
            let timerSeconds = room.game_id?.turn_timer_seconds ?? 30;
            if (game?.turn_start_time) {
                const elapsed = (Date.now() - new Date(game.turn_start_time).getTime()) / 1000;
                timerSeconds = Math.max(0, timerSeconds - elapsed);
            }

            // 12. Find opponent socket
            const socketsInRoom = await namespace.in(room_id).fetchSockets();
            const opponentSocket = socketsInRoom.find(s => s.data.player_id !== player_id) ?? null;

            // 13. Check win condition

            if (checkWin(board, playerNum)) {
                clearTurnTimer(socket);
                if (opponentSocket) clearTurnTimer(opponentSocket);

                // Finish room
                room.status = 'finished';
                room.winner = player_id;
                room.winner_reason = 'win';
                room.finished_at = new Date();
                await room.save();

                game.board = board;
                await game.save();

                const prize = room.bet_amount + (room.bet_amount * (1 - room.house_edge / 100));
                await User.findByIdAndUpdate(player_id, { $inc: { balance: prize } });

                socket.emit(EVENT, WsBaseResponse.success({
                    board,
                    outcome: 'win',
                    prize,
                    yourTurn: false,
                    gameEnded: true,
                    isPlayerOne: playerNum === 1,
                }, [i18n.__('ws.games.winLastShip') || 'You win!']));

                if (opponentSocket) {
                    opponentSocket.emit(EVENT, WsBaseResponse.success({
                        board,
                        outcome: 'lose',
                        yourTurn: false,
                        gameEnded: true,
                        isPlayerOne: opponentSocket.data.playerNum === 1,
                    }, [i18n.__('ws.games.loseLastShip') || 'You lose!']));
                }

                const { getIo } = require('../../../../shared/config/ws');
                const io = getIo();
                if (io) io.of('/rooms').emit('roomDeleted', { id: room_id });

                socket.data.jumpingPiece = null;
                return;
            }

            // 12. Chain-jump continuation — if we just jumped and can jump again
            if (isJump && canJumpFurther(board, tr, tc)) {
                // Lock the piece so only it can jump next
                socket.data.jumpingPiece = { row: tr, col: tc };

                game.board = board;
                await game.save();

                // Notify opponent board changed (they do NOT get the turn)
                socket.to(room_id).emit(EVENT, WsBaseResponse.success({
                    board,
                    yourTurn: false,
                    turnTimerSeconds: timerSeconds,
                    outcome: '',
                    isPlayerOne: opponentSocket?.data?.playerNum === 1,
                }, ['Opponent is continuing their jump chain.']));

                socket.emit(EVENT, WsBaseResponse.success({
                    board,
                    yourTurn: true,
                    turnTimerSeconds: timerSeconds,
                    outcome: '',
                    isPlayerOne: playerNum === 1,
                    continuingJump: true,
                    jumpingPiece: { row: tr, col: tc },
                }, ['Jump successful! You may continue jumping with the same piece, or press End Turn.']));

                return;
            }

            // 13. Move done — keep turn with current player, wait for end_turn.
            // This applies to: a step, a single jump, or the final jump in a chain.
            // The turn NEVER auto-swaps in Halma — the player must emit end_turn.
            socket.data.jumpingPiece = null; // unlock piece constraint

            game.board = board;
            await game.save();

            // Notify opponent that the board changed (but it's still our turn)
            socket.to(room_id).emit(EVENT, WsBaseResponse.success({
                board,
                yourTurn: false,
                turnTimerSeconds: timerSeconds,
                outcome: '',
                isPlayerOne: opponentSocket?.data?.playerNum === 1,
            }, ['Opponent made a move.']));

            // Tell current player: move accepted, press End Turn when ready
            socket.emit(EVENT, WsBaseResponse.success({
                board,
                yourTurn: true,
                turnTimerSeconds: timerSeconds,
                outcome: '',
                isPlayerOne: playerNum === 1,
                mustEndTurn: true,
            }, ['Move accepted. Press End Turn when you are done.']));

            logger.info(`Halma move: P${playerNum} [${fr},${fc}]→[${tr},${tc}] (${isJump ? 'jump' : 'step'}) in room ${room_id}`, { className: filename });


        } catch (err) {
            logger.error(`Error in halma move: ${err}`, { className: filename });
            emitMsg = WsBaseResponse.error({}, [i18n.__('ws.games.shotError') || 'An error occurred processing your move.']);
            socket.emit(EVENT, emitMsg);
        }
    });
};
