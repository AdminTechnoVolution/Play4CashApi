const { KEY_RPS_WAITING_QUEUE, EVENT_NAME_MATCHMAKING } = require('../../../../shared/util/constants');
const redisClient = require('../../../../shared/config/redis');
const i18n = require('../../../../shared/language/i18n');
const WsBaseResponse = require('../../../../shared/util/wsBaseResponse');

module.exports = (socket, namespace) => {
    socket.on('disconnect', async (reason) => {
        if (socket.data?.isManualDisconnect) return;

        let emitMsg;
        const data = socket.data;
        if (!data || !data.roomId || !data.opponentId) return;

        //TODO: Validate if created in Mongo. If created in mongo cause' it already started and return

        const queueKey = KEY_RPS_WAITING_QUEUE + data.bet;
        const opponentSocket = namespace.sockets.get(data.opponentId);

        if (opponentSocket) {
            opponentSocket.leave(data.roomId);
            opponentSocket.data = null;

            emitMsg = WsBaseResponse.error({}, i18n.__('ws.games.opponentLeft'));
            opponentSocket.emit(EVENT_NAME_MATCHMAKING, emitMsg);

            await redisClient.rPush(queueKey, opponentSocket.id);
            emitMsg = WsBaseResponse.success({}, i18n.__('ws.games.waitingOpponent'));
            opponentSocket.emit(EVENT_NAME_MATCHMAKING, emitMsg);
        }
    });
};