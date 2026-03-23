const jwt = require('../../../shared/util/jwt');

module.exports = (socket, namespace) => {
    const player_id = jwt.getValueFromJwtToken(socket.data.token, 'id');
    socket.data.player_id = player_id;
    socket.data.myTurn = false;
    socket.data.playerNum = null;

    require('./actions/join')(socket, namespace);
    require('./actions/move')(socket, namespace);
    require('./actions/draw')(socket, namespace);
    require('./actions/pass')(socket, namespace);
    require('./actions/disconnect')(socket, namespace);
};
