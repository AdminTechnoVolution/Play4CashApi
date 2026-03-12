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
    const player_id = jwt.getValueFromJwtToken(socket.data.token, 'id');
    socket.data.player_id = player_id;
    socket.data.myTurn = false;
    socket.data.turnTimer = null;

    // Wire event handlers
    onJoin(socket, namespace);
    onFire(socket, namespace);
    onDisconnect(socket, namespace);

};
