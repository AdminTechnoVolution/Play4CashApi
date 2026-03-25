const Joi = require('joi');
const WsBaseResponse = require('../../../shared/util/wsBaseResponse');

const subscribeSchema = Joi.object({
    game_id: Joi.string().length(24).required()
});

module.exports = (socket, namespace) => {
    // The /rooms namespace broadcasts real-time updates scoped by game.
    // Clients must subscribe to a specific game channel to receive its events.
    //
    // Flow:
    //  1. Client connects to /rooms namespace (authenticated via JWT middleware)
    //  2. Client emits 'subscribe' with { game_id } → server joins socket to 'game:{game_id}' room
    //  3. room.service.js emits roomCreated/Updated/Deleted to 'game:{game_id}' only
    //  4. Client emits 'unsubscribe' or disconnects to leave the channel

    socket.on('subscribe', (payload) => {
        const { error, value } = subscribeSchema.validate(payload);
        if (error) {
            socket.emit('rooms', WsBaseResponse.error({}, [error.details[0].message]));
            return;
        }
        // Leave previous game channel if any
        socket.rooms.forEach(room => {
            if (room !== socket.id && room.startsWith('game:')) {
                socket.leave(room);
            }
        });
        socket.join(`game:${value.game_id}`);
    });

    socket.on('unsubscribe', () => {
        socket.rooms.forEach(room => {
            if (room !== socket.id && room.startsWith('game:')) {
                socket.leave(room);
            }
        });
    });
};

