const { KEY_RPS_WAITING_QUEUE, EVENT_NAME_MATCHMAKING, COUNTDOWN_SECONDS, KEY_GAME_RPS, STATUS_ROOM_STARTED } = require('../../../../shared/util/constants');
const path = require('path');
const logger = require('../../../../shared/config/logger');
const filename = path.basename(__filename);
const jwt = require('../../../../shared/util/jwt');
const Joi = require('joi');
const redisClient = require('../../../../shared/config/redis');
const WsBaseResponse = require('../../../../shared/util/wsBaseResponse');
const util = require('../../../../shared/util/util');
const i18n = require('../../../../shared/language/i18n');
const User = require('../../../models/user.model');
const Game = require('../../../models/game.model');
const Room = require('../../../models/room.model');

module.exports = (socket, namespace) => {
    socket.on('matchmaking', async (payload) => {
        let emitMsg;
        try {
            util.setLanguageToSocket(socket);

            const { error } = matchmakingSchema.validate(payload, { abortEarly: false });
            if (error) {
                emitMsg = WsBaseResponse.error(socket.data, error.details.map(d => i18n.__(d.message) || d.message));
                socket.emit(EVENT_NAME_MATCHMAKING, emitMsg);
                socket.disconnect(true);
                return;
            }

            const userId = jwt.getValueFromJwtToken(socket.data.token, "id");

            if (await hasBalanceForBet(userId, payload.bet) === false) {
                emitMsg = WsBaseResponse.error(socket.data, i18n.__('ws.games.insufficientBalance'));
                socket.emit(EVENT_NAME_MATCHMAKING, emitMsg);
                socket.disconnect(true);
                return;
            }

            const queueKey = KEY_RPS_WAITING_QUEUE + payload.bet;
            const waitingPlayerId = await redisClient.lPop(queueKey);

            if (!waitingPlayerId) {
                emitMsg = WsBaseResponse.success(socket.data, i18n.__('ws.games.waitingOpponent'));
                await redisClient.rPush(queueKey, socket.id);
                socket.emit(EVENT_NAME_MATCHMAKING, emitMsg);
                return;
            }

            const waitingSocket = namespace.sockets.get(waitingPlayerId);

            if (!waitingSocket) {
                emitMsg = WsBaseResponse.success(socket.data, i18n.__('ws.games.waitingOpponent'));
                await redisClient.rPush(queueKey, socket.id);
                socket.emit(EVENT_NAME_MATCHMAKING, emitMsg);
                return;
            }

            const roomId = util.generateRoomCode(256);
            socket.join(roomId);
            waitingSocket.join(roomId);

            emitMsg = WsBaseResponse.success({
                players: [
                    jwt.getValueFromJwtToken(waitingSocket.data.token, "username"),
                    jwt.getValueFromJwtToken(socket.data.token, "username")],
                roomId,
                bet: payload.bet
            }, [i18n.__('ws.games.matchFound')]);

            namespace.to(roomId).emit(EVENT_NAME_MATCHMAKING, emitMsg);
            const userIdWaitingSocket = jwt.getValueFromJwtToken(waitingSocket.data.token, "id");

            socket.data.userId = userId;
            socket.data.opponentId = waitingSocket.id;
            socket.data.roomId = roomId;
            socket.data.bet = payload.bet;

            waitingSocket.data.userId = userIdWaitingSocket;
            waitingSocket.data.opponentId = socket.id;
            waitingSocket.data.roomId = roomId;
            waitingSocket.data.bet = payload.bet;

            await startRoom(namespace, socket, waitingSocket);
        } catch (err) {
            logger.error(`Error doing the matchmaking: ${err}`, { className: filename });
            emitMsg = WsBaseResponse.error(socket.data, i18n.__('ws.games.matchmakingError'));
            socket.emit(EVENT_NAME_MATCHMAKING, emitMsg);
            return;
        }
    });
};

const startRoom = async (namespace, socket, waitingSocket) => {
    const roomId = socket.data.roomId;
    try {
        await runCountdown(namespace, roomId);
        const { success, game } = await doStartRoomValidations(namespace, socket, waitingSocket);
        if (success == true) {
            await createRoom(socket, waitingSocket, game);
            const { user1, user2 } = await discountBalances(socket, waitingSocket);
            await startedRoom(namespace, socket, waitingSocket, user1, user2);
        }
    } catch (err) {
        logger.error(`Countdown aborted for ${roomId}: ${err.message}`, { className: filename });
    }
}

const startedRoom = async (namespace, socketPlayer1, socketPlayer2, user1, user2) => {
    let emitMsg;
    emitMsg = WsBaseResponse.success({}, i18n.__('ws.games.startedRoom'));
    namespace.to(socketPlayer1.data.roomId).emit(EVENT_NAME_MATCHMAKING, emitMsg);

    socketPlayer1.data.started = true;
    socketPlayer1.data.newBalance = user1.balance;

    socketPlayer2.data.started = true;
    socketPlayer2.data.newBalance = user2.balance;
}

const discountBalances = async (player1, player2) => {
    const bet = player1.data.bet;
    const user1 = await User.findByIdAndUpdate(
        player1.data.userId,
        { $inc: { balance: -bet } },
        { new: true }
    );

    const user2 = await User.findByIdAndUpdate(
        player2.data.userId,
        { $inc: { balance: -bet } },
        { new: true }
    );

    return { user1, user2 };
}

const createRoom = async (player1, player2, game) => {
    let room = new Room({
        code: player1.data.roomId,
        game_id: game._id,
        players: [{
            playerId: player1.data.userId
        }, {
            playerId: player2.data.userId
        }],
        bet_amount: player1.data.bet,
        house_edge: game.house_edge,
        public: true,
        status: STATUS_ROOM_STARTED
    });

    await room.save();
}

const doStartRoomValidations = async (namespace, socket, waitingSocket) => {
    const roomId = socket.data.roomId;
    const bet = socket.data.bet;

    const room = await Room.findOne({
        code: roomId
    });

    if (room) return { success: false };;

    if (await hasBalanceForBet(socket.data.userId, bet) === false) {
        await errorHasBalanceForBet(socket, waitingSocket, roomId);
        return { success: false };
    }

    if (await hasBalanceForBet(waitingSocket.data.userId, bet) === false) {
        await errorHasBalanceForBet(waitingSocket, socket, roomId);
        return { success: false };
    }

    const game = await Game.findOne({
        socket_code: KEY_GAME_RPS,
        active: true
    }).lean();

    if (!game) {
        await errorGameNotFound(socket, waitingSocket, namespace, roomId);
        return { success: false };
    }

    if (game.min_bet > bet) {
        await manualDisconnect(socket, waitingSocket, roomId, 'ws.games.betNotAllowed');
        return { success: false };
    }

    const player1 = namespace.sockets.get(waitingSocket.id);
    const player2 = namespace.sockets.get(socket.id);

    if (!player1) {
        await errorPlayerDisconnected(socket, roomId);
        return { success: false };
    }

    if (!player2) {
        await errorPlayerDisconnected(waitingSocket, roomId);
        return { success: false };
    }

    if (player1.data.userId === player2.data.userId) {
        await manualDisconnect(socket, waitingSocket, roomId, 'ws.games.matchCancelled');
        return { success: false };
    }

    return { success: true, game: game };
}

const manualDisconnect = async (socket, waitingSocket, roomId, message) => {
    const emitMsg = WsBaseResponse.error({}, i18n.__(message));
    namespace.to(roomId).emit(EVENT_NAME_MATCHMAKING, emitMsg);

    socket.data.isManualDisconnect = true;
    waitingSocket.data.isManualDisconnect = true;

    socket.leave(roomId);
    waitingSocket.leave(roomId);

    socket.disconnect(true);
    waitingSocket.disconnect(true);
}

const hasBalanceForBet = async (userId, bet) => {
    try {
        const user = await User.findById(userId).lean();

        return user.balance >= bet;
    } catch {
        return false;
    }
}

const runCountdown = async (namespace, roomId) => {
    return new Promise((resolve) => {
        let remaining = COUNTDOWN_SECONDS;
        let message = i18n.__('ws.games.startingIn') + remaining;
        let emitMsg = WsBaseResponse.success({}, [message]);

        namespace.to(roomId).emit(EVENT_NAME_MATCHMAKING, emitMsg);

        const interval = setInterval(async () => {
            remaining -= 1;

            if (remaining > 0) {
                let message = i18n.__('ws.games.startingIn') + remaining;
                let emitMsg = WsBaseResponse.success({}, [message]);

                namespace.to(roomId).emit(EVENT_NAME_MATCHMAKING, emitMsg);
            } else {
                clearInterval(interval);
                return resolve();
            }
        }, 1000);
    });
}

const errorPlayerDisconnected = async (opponentSocket, roomId) => {
    let emitMsg;

    opponentSocket.leave(roomId);

    emitMsg = WsBaseResponse.error({}, i18n.__('ws.games.playerDisconnected'));
    opponentSocket.emit(EVENT_NAME_MATCHMAKING, emitMsg);

    const queueKey = KEY_RPS_WAITING_QUEUE + opponentSocket.data.bet;

    await redisClient.rPush(queueKey, opponentSocket.id);
    emitMsg = WsBaseResponse.success({}, i18n.__('ws.games.waitingOpponent'));
    opponentSocket.emit(EVENT_NAME_MATCHMAKING, emitMsg);
}

const errorGameNotFound = async (socket, opponentSocket, namespace, roomId) => {
    const emitMsg = WsBaseResponse.error({}, i18n.__('ws.games.gameNotFound'));
    namespace.to(roomId).emit(EVENT_NAME_MATCHMAKING, emitMsg);

    socket.disconnect(true);
    opponentSocket.disconnect(true);
}

const errorHasBalanceForBet = async (socket, opponentSocket, roomId) => {
    let emitMsg;

    emitMsg = WsBaseResponse.error(socket.data, i18n.__('ws.games.insufficientBalance'));
    socket.emit(EVENT_NAME_MATCHMAKING, emitMsg);
    socket.disconnect(true);
    opponentSocket.leave(roomId);

    emitMsg = WsBaseResponse.error({}, i18n.__('ws.games.matchCancelled'));
    opponentSocket.emit(EVENT_NAME_MATCHMAKING, emitMsg);

    const queueKey = KEY_RPS_WAITING_QUEUE + opponentSocket.data.bet;

    await redisClient.rPush(queueKey, opponentSocket.id);
    emitMsg = WsBaseResponse.success({}, i18n.__('ws.games.waitingOpponent'));
    opponentSocket.emit(EVENT_NAME_MATCHMAKING, emitMsg);
}

const matchmakingSchema = Joi.object({
    bet: Joi.number().integer().min(1).required()
        .messages({
            'any.required': 'bet.required',
            'number.base': 'bet.mustBeNumber',
            'number.integer': 'bet.integer',
            'number.min': 'bet.min'
        })
});