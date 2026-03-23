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
const { createInitialBoard } = require('./gameLogic');
const { startTurnTimer, clearTurnTimer } = require('./timerUtils');

const EVENT = 'chess';

const joinSchema = Joi.object({
    room_id: Joi.string().length(24).required(),
});

module.exports = (socket, namespace) => {
    socket.on('join', async (payload) => {
        let emitMsg;
        try {
            util.setLanguageToSocket(socket);

            const { error } = joinSchema.validate(payload, { abortEarly: false });
            if (error) {
                emitMsg = WsBaseResponse.error({}, error.details.map(d => d.message));
                socket.emit(EVENT, emitMsg);
                return;
            }

            const { room_id } = payload;
            const player_id = jwt.getValueFromJwtToken(socket.data.token, 'id');

            const room = await Room.findById(room_id).populate('game_id', 'turn_timer_seconds');
            if (!room) {
                emitMsg = WsBaseResponse.error({}, [i18n.__('ws.games.gameNotFound') || 'Room not found.']);
                socket.emit(EVENT, emitMsg);
                return;
            }

            if (room.status !== 'waiting' && room.status !== 'started') {
                emitMsg = WsBaseResponse.error({}, [i18n.__('ws.games.roomInactive') || 'Room is no longer active.']);
                socket.emit(EVENT, emitMsg);
                return;
            }

            const isMember = room.players.some(p => p.playerId.toString() === player_id);
            if (!isMember) {
                emitMsg = WsBaseResponse.error({}, [i18n.__('ws.games.notInRoom') || 'You are not a member of this room.']);
                socket.emit(EVENT, emitMsg);
                return;
            }

            socket.join(room_id);
            socket.data.player_id = player_id;
            socket.data.room_id = room_id;
            if (socket.save) await socket.save();

            const playerIndex = room.players.findIndex(p => p.playerId.toString() === player_id);
            const playerNum = playerIndex === 0 ? 1 : 2;
            socket.data.playerNum = playerNum;
            if (socket.save) await socket.save();

            logger.info(`Player ${player_id} (P${playerNum}) joined chess room ${room_id}`, { className: filename });

            if (room.status === 'started') {
                const game = await ChessGame.findOne({ room_id });
                let timerSeconds = room.game_id?.turn_timer_seconds ?? 30;
                const isMyTurn = game ? game.current_player === playerNum : playerNum === 1;

                if (game?.turn_start_time) {
                    const elapsed = (Date.now() - new Date(game.turn_start_time).getTime()) / 1000;
                    timerSeconds = Math.max(0, timerSeconds - elapsed);
                }

                socket.data.myTurn = isMyTurn;
                socket.data.turnTimerSeconds = timerSeconds;
                if (socket.save) await socket.save();

                socket.emit(EVENT, WsBaseResponse.success({
                    board: game ? game.board : createInitialBoard(),
                    yourTurn: isMyTurn,
                    turnTimerSeconds: timerSeconds,
                    waitingForOpponent: false,
                    isPlayerOne: playerNum === 1,
                    playingWhite: playerNum === 1,
                    gameStarted: true,
                    youWon: false,
                }, [isMyTurn
                    ? (i18n.__('ws.games.opponentReady') || 'Game in progress. Your turn!')
                    : (i18n.__('ws.games.opponentReadyWait') || 'Game in progress. Waiting for opponent.')
                ]));
                return;
            }

            emitMsg = WsBaseResponse.success(
                { room_id, waitingForOpponent: true, isPlayerOne: playerNum === 1 },
                [i18n.__('ws.games.waitingOpponent') || 'Joined room. Waiting for opponent.']
            );
            socket.emit(EVENT, emitMsg);

            const joiningUser = await User.findById(player_id).select('username');
            const username = joiningUser?.username || 'Opponent';

            const socketsInRoom = await namespace.in(room_id).fetchSockets();

            if (socketsInRoom.length > 1) {
                const translatedMessage = i18n.__('ws.games.opponentJoined', { username }) || `${username} has joined the room!`;
                socket.to(room_id).emit(EVENT, WsBaseResponse.success(
                    { opponentJoined: true, opponentName: username },
                    [translatedMessage]
                ));
            }

            if (socketsInRoom.length === 2) {
                const startedRoom = await Room.findOneAndUpdate(
                    { _id: room_id, status: 'waiting' },
                    { $set: { status: 'started' } },
                    { new: true }
                );
                if (!startedRoom) return;

                const player1_id = room.players[0].playerId;
                const player2_id = room.players[1].playerId;

                const deduct1 = await User.findOneAndUpdate(
                    { _id: player1_id, balance: { $gte: room.bet_amount } },
                    { $inc: { balance: -room.bet_amount } }
                );
                const deduct2 = await User.findOneAndUpdate(
                    { _id: player2_id, balance: { $gte: room.bet_amount } },
                    { $inc: { balance: -room.bet_amount } }
                );

                if (!deduct1 || !deduct2) {
                    if (deduct1) await User.updateOne({ _id: player1_id }, { $inc: { balance: room.bet_amount } });
                    if (deduct2) await User.updateOne({ _id: player2_id }, { $inc: { balance: room.bet_amount } });
                    await Room.findByIdAndUpdate(room_id, { $set: { status: 'waiting' } });

                    for (const s of socketsInRoom) {
                        s.emit(EVENT, WsBaseResponse.error({}, ['Insufficient balance to start the game.']));
                    }
                    return;
                }

                const board = createInitialBoard();
                await ChessGame.create({ 
                    room_id, 
                    player1_id, 
                    player2_id, 
                    board, 
                    current_player: 1,
                    castling_rights: { wK: true, wQ: true, bK: true, bQ: true },
                    en_passant_target: null,
                    turn_start_time: new Date()
                });

                const timerSeconds = room.game_id?.turn_timer_seconds ?? 30;

                let p1Socket = null, p2Socket = null;
                for (const s of socketsInRoom) {
                    if (s.data.playerNum === 1) p1Socket = s;
                    else if (s.data.playerNum === 2) p2Socket = s;
                }

                if (p1Socket) {
                    p1Socket.data.myTurn = true;
                    p1Socket.emit(EVENT, WsBaseResponse.success({
                        board,
                        yourTurn: true,
                        turnTimerSeconds: timerSeconds,
                        waitingForOpponent: false,
                        isPlayerOne: true,
                        playingWhite: true,
                        gameStarted: true,
                        youWon: false,
                    }, [i18n.__('ws.games.opponentReady') || 'Game started! Your turn — make a move!']));
                }

                if (p2Socket) {
                    p2Socket.data.myTurn = false;
                    p2Socket.emit(EVENT, WsBaseResponse.success({
                        board,
                        yourTurn: false,
                        turnTimerSeconds: timerSeconds,
                        waitingForOpponent: false,
                        isPlayerOne: false,
                        playingWhite: false,
                        gameStarted: true,
                        youWon: false,
                    }, [i18n.__('ws.games.opponentReadyWait') || 'Game started! Waiting for opponent to move.']));
                }

                // Start turn timer for Player 1
                if (p1Socket && p2Socket) {
                    startTurnTimer(p1Socket, p2Socket, namespace, room_id, timerSeconds);
                }

                // Notify global rooms lobby
                const { getIo } = require('../../../../shared/config/ws');
                const io = getIo();
                if (io) {
                    const populatedRoom = await Room.findById(room_id)
                        .populate('game_id', '-created_at')
                        .populate('players.playerId', 'username')
                        .lean();
                    if (populatedRoom?.game_id?.name) {
                        const lang = socket.handshake?.headers?.['accept-language'] || 'en';
                        populatedRoom.game_id = {
                            ...populatedRoom.game_id,
                            name: lang === 'es' ? populatedRoom.game_id.name.es : populatedRoom.game_id.name.en,
                            description: lang === 'es' ? populatedRoom.game_id.description?.es : populatedRoom.game_id.description?.en,
                        };
                    }
                    io.of('/rooms').emit('roomUpdated', populatedRoom);
                }

                logger.info(`Chess auto-started: room ${room_id} — P1:${player1_id}, P2:${player2_id}`, { className: filename });
            }

        } catch (err) {
            logger.error(`Error joining chess room: ${err}`, { className: filename });
            emitMsg = WsBaseResponse.error({}, [i18n.__('ws.games.matchmakingError') || 'Error joining room.']);
            socket.emit(EVENT, emitMsg);
        }
    });
};
