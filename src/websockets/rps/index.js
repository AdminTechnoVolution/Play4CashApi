const matchmaking = require('./actions/matchmaking');
const onDisconnect = require('./actions/disconnect');

module.exports = (socket, namespace) => {
    matchmaking(socket, namespace);
    onDisconnect(socket, namespace);
};