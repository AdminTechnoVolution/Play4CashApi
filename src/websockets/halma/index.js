const jwt = require('../../../shared/util/jwt');
const onJoin = require('./actions/join');
const onMove = require('./actions/move');
const onEndTurn = require('./actions/endTurn');
const onDisconnect = require('./actions/disconnect');

module.exports = (socket, namespace) => {
    const player_id = jwt.getValueFromJwtToken(socket.data.token, 'id');
    socket.data.player_id = player_id;
    socket.data.myTurn = false;
    socket.data.turnTimer = null;
    socket.data.jumpingPiece = null;
    socket.data.playerNum = null;

    onJoin(socket, namespace);
    onMove(socket, namespace);
    onEndTurn(socket, namespace);
    onDisconnect(socket, namespace);
};

