const WsBaseResponse = require('../../../../shared/util/wsBaseResponse');
const i18n = require('../../../../shared/language/i18n');
const logger = require('../../../../shared/config/logger');
const path = require('path');
const filename = path.basename(__filename);
const Room = require('../../../models/room.model');
const User = require('../../../models/user.model');

const EVENT = 'halma';

module.exports = (socket, namespace) => {
    socket.on('disconnect', async () => {
        try {
            const { player_id, room_id } = socket.data;
            if (!room_id) return;

            // Peek at room WITHOUT modifying players array
            const room = await Room.findOne({ _id: room_id, 'players.playerId': player_id });
            if (!room) return;

            if (room.status === 'finished') return;

            // ── WAITING ──────────────────────────────────────────────────────────
            if (room.status === 'waiting') {
                const updatedRoom = await Room.findOneAndUpdate(
                    { _id: room_id, 'players.playerId': player_id },
                    { $pull: { players: { playerId: player_id } } },
                    { new: true }
                );
                if (!updatedRoom) return;

                if (updatedRoom.players.length === 0) {
                    await Room.findOneAndDelete({ _id: room_id, players: { $size: 0 } });
                    const { getIo } = require('../../../../shared/config/ws');
                    const io = getIo();
                    if (io) io.of('/rooms').emit('roomDeleted', { id: room_id });
                } else {
                    const sockets = await namespace.in(room_id).fetchSockets();
                    for (const s of sockets) {
                        if (s.id !== socket.id) {
                            s.emit(EVENT, WsBaseResponse.success(
                                { opponentLeft: true, waitingForOpponent: true },
                                [i18n.__('ws.games.opponentLeft')]
                            ));
                        }
                    }
                }
                logger.info(`Halma: Player ${player_id} left waiting room ${room_id}`, { className: filename });
                return;
            }

            // ── STARTED — forfeit, keep both players in document ─────────────────
            const winner_id = room.players.find(p => p.playerId.toString() !== player_id)?.playerId;

            room.status = 'finished';
            room.winner = winner_id;
            room.winner_reason = 'forfeit';
            room.finished_at = new Date();
            await room.save();

            const prize = room.bet_amount + (room.bet_amount * (1 - room.house_edge / 100));
            await User.updateOne({ _id: winner_id }, { $inc: { balance: prize } });

            const { getIo } = require('../../../../shared/config/ws');
            const io = getIo();
            if (io) {
                io.of('/rooms').emit('roomDeleted', { id: room_id });

                const sockets = await namespace.in(room_id).fetchSockets();
                for (const s of sockets) {
                    if (s.id !== socket.id) {
                        s.emit(EVENT, WsBaseResponse.error(
                            { outcome: 'opponent_disconnected', gameEnded: true },
                            [i18n.__('ws.games.playerDisconnected')]
                        ));
                    }
                }
            }

            logger.info(`Halma: Player ${player_id} forfeited by disconnecting from room ${room_id}`, { className: filename });

        } catch (err) {
            logger.error(`Error in halma disconnect: ${err}`, { className: filename });
        }
    });
};
