const jwt = require('../../../../shared/util/jwt');
const WsBaseResponse = require('../../../../shared/util/wsBaseResponse');
const i18n = require('../../../../shared/language/i18n');
const util = require('../../../../shared/util/util');
const logger = require('../../../../shared/config/logger');
const path = require('path');
const filename = path.basename(__filename);
const Joi = require('joi');
const Room = require('../../../models/room.model');
const DominoGame = require('../../../models/dominoGame.model');
const User = require('../../../models/user.model');
const { deal, getStartingPlayerIndex } = require('./gameLogic');
const { startTurnTimer } = require('./timerUtils');

const EVENT = 'domino';

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

            const maxPlayers = room.player_limit || room.game_id?.max_players || 2;
            const isMember = room.players.some(p => p.playerId.toString() === player_id);
            if (!isMember) {
                emitMsg = WsBaseResponse.error({}, [i18n.__('ws.games.notInRoom') || 'You are not a member of this room.']);
                socket.emit(EVENT, emitMsg);
                return;
            }

            socket.join(room_id);
            socket.data.player_id = player_id;
            socket.data.room_id = room_id;

            const playerIndexInRoom = room.players.findIndex(p => p.playerId.toString() === player_id);
            socket.data.playerNum = playerIndexInRoom + 1;

            if (room.status === 'started') {
                const game = await DominoGame.findOne({ room_id });
                if (game) {
                    const myHand = game.hands.get(player_id);
                    const isMyTurn = game.player_ids[game.current_player_index].toString() === player_id;
                    let timerSeconds = room.game_id?.turn_timer_seconds ?? 30;
                    
                    if (game.turn_start_time) {
                        const elapsed = (Date.now() - new Date(game.turn_start_time).getTime()) / 1000;
                        timerSeconds = Math.max(0, timerSeconds - elapsed);
                    }

                    socket.emit(EVENT, WsBaseResponse.success({
                        hand: myHand,
                        board: game.board,
                        boneyardCount: game.boneyard.length,
                        yourTurn: isMyTurn,
                        turnTimerSeconds: timerSeconds,
                        gameStarted: true,
                    }, [isMyTurn ? i18n.__('ws.games.opponentReady') : i18n.__('ws.games.opponentReadyWait')]));
                    return;
                }
            }

            socket.emit(EVENT, WsBaseResponse.success({ waitingForOpponent: true }, [i18n.__('ws.games.waitingOpponent')]));

            const socketsInRoom = await namespace.in(room_id).fetchSockets();

            // If room is full, start the game
            if (socketsInRoom.length === maxPlayers && room.status === 'waiting') {
                const updatedRoom = await Room.findOneAndUpdate(
                    { _id: room_id, status: 'waiting' },
                    { $set: { status: 'started' } },
                    { new: true }
                );
                if (!updatedRoom) return;

                const playerIds = room.players.map(p => p.playerId);
                
                // Deduct balances
                for (const pid of playerIds) {
                    const deduct = await User.findOneAndUpdate(
                        { _id: pid, balance: { $gte: room.bet_amount } },
                        { $inc: { balance: -room.bet_amount } }
                    );
                    if (!deduct) {
                        // Rollback and fail
                        await Room.findByIdAndUpdate(room_id, { $set: { status: 'waiting' } });
                        namespace.in(room_id).emit(EVENT, WsBaseResponse.error({}, ['One or more players have insufficient balance.']));
                        return;
                    }
                }

                const { hands, boneyard } = deal(playerIds);
                const startingIndex = getStartingPlayerIndex(playerIds, hands);
                const timerSeconds = room.game_id?.turn_timer_seconds ?? 30;

                const game = await DominoGame.create({
                    room_id,
                    player_ids: playerIds,
                    hands,
                    boneyard,
                    current_player_index: startingIndex,
                    turn_start_time: new Date(),
                    status: 'active'
                });

                // Notify all players
                for (const s of socketsInRoom) {
                    const pid = s.data.player_id.toString();
                    const isMyTurn = playerIds[startingIndex].toString() === pid;
                    
                    s.emit(EVENT, WsBaseResponse.success({
                        hand: hands.get(pid),
                        board: [],
                        boneyardCount: boneyard.length,
                        yourTurn: isMyTurn,
                        turnTimerSeconds: timerSeconds,
                        gameStarted: true
                    }, [isMyTurn ? i18n.__('ws.games.opponentReady') : i18n.__('ws.games.opponentReadyWait')]));

                    if (isMyTurn) {
                        startTurnTimer(s, socketsInRoom, namespace, room_id, timerSeconds);
                    }
                }
                
                logger.info(`Domino game started in room ${room_id}`, { className: filename });
            }

        } catch (err) {
            logger.error(`Error in Domino join: ${err}`, { className: filename });
            socket.emit(EVENT, WsBaseResponse.error({}, [i18n.__('ws.games.matchmakingError')]));
        }
    });
};
