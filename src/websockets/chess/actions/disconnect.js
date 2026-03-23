const Room = require('../../../models/room.model');
const User = require('../../../models/user.model');
const logger = require('../../../../shared/config/logger');
const path = require('path');
const filename = path.basename(__filename);
const i18n = require('../../../../shared/language/i18n');
const WsBaseResponse = require('../../../../shared/util/wsBaseResponse');
const { clearTurnTimer } = require('./timerUtils');

const EVENT = 'chess';

module.exports = (socket, namespace) => {
    socket.on('disconnect', async (reason) => {
        try {
            // 1. Clear turn timer immediately for THIS socket to prevent race conditions with timerUtils
            clearTurnTimer(socket);

            logger.info(`Chess Disconnect: Handler triggered for reason: ${reason}`);
            const { room_id, player_id } = socket.data;
            
            if (!room_id || !player_id) {
                logger.info('Chess Disconnect: Missing room_id or player_id in socket data, skipping cleanup');
                return;
            }

            logger.info(`Chess Disconnect: Processing disconnect for player ${player_id} in room ${room_id}`);

            logger.info('Chess Disconnect: Fetching room from database');
            const room = await Room.findOne({ _id: room_id, 'players.playerId': player_id });
            
            if (!room || room.status === 'finished') {
                logger.info(`Chess Disconnect: Room ${room_id} not found or already finished. Status: ${room?.status}, Winner: ${room?.winner}`);
                if (!room) logger.warn(`Chess Disconnect: Room ${room_id} not found for player ${player_id}`, { className: filename });
                return;
            }

            // ── WAITING ──────────────────────────────────────────────────────────
            if (room.status === 'waiting') {
                logger.info('Chess Disconnect: Room status is "waiting". Removing player from room.');
                const updatedRoom = await Room.findOneAndUpdate(
                    { _id: room_id, 'players.playerId': player_id },
                    { $pull: { players: { playerId: player_id } } },
                    { new: true }
                );
                
                if (!updatedRoom) {
                    logger.info('Chess Disconnect: Failed to update room in "waiting" state (room might have been deleted concurrently)');
                    return;
                }

                const { getIo } = require('../../../../shared/config/ws');
                const io = getIo();

                if (updatedRoom.players.length === 0) {
                    logger.info('Chess Disconnect: Room is empty, deleting room and emitting roomDeleted event.');
                    await Room.findOneAndDelete({ _id: room_id, players: { $size: 0 } });
                    if (io) io.of('/rooms').emit('roomDeleted', { id: room_id });
                } else {
                    logger.info('Chess Disconnect: Notifying remaining player that their opponent left the lobby.');
                    namespace.to(room_id).emit(EVENT, WsBaseResponse.success(
                        { opponentLeft: true, waitingForOpponent: true },
                        [i18n.__('ws.games.opponentLeft') || 'Opponent abandoned the lobby.']
                    ));
                }
                logger.info(`Chess Disconnect: Player ${player_id} successfully left waiting room ${room_id}`);
                return;
            }

            // ── STARTED — forfeit ────────────────────────────────────────────────
            logger.info('Chess Disconnect: Room status is "started". Handling forfeit logic.');
            
            // Re-fetch room safely to ensure we have current players for winner selection
            const winner_id = room.players.find(p => p.playerId.toString() !== player_id.toString())?.playerId;
            
            if (!winner_id) {
                logger.error(`Chess Disconnect: Winner not found for p:${player_id} r:${room_id}`, { className: filename });
                return;
            }

            logger.info(`Chess Disconnect: Declaring player ${winner_id} as winner by forfeit for player ${player_id} abandoning.`);
            room.status = 'finished';
            room.winner = winner_id;
            room.winner_reason = 'forfeit';
            room.finished_at = new Date();
            
            logger.info('Chess Disconnect: Updating room status to "finished" in database.');
            await room.save();

            const prize = room.bet_amount + (room.bet_amount * (1 - room.house_edge / 100));
            logger.info(`Chess Disconnect: Awarding prize amount ${prize} to winner ${winner_id}.`);
            await User.findByIdAndUpdate(winner_id, { $inc: { balance: prize } });

            const { getIo } = require('../../../../shared/config/ws');
            const io = getIo();
            if (io) {
                logger.info('Chess Disconnect: Emitting global roomDeleted event.');
                io.of('/rooms').emit('roomDeleted', { id: room_id });

                logger.info('Chess Disconnect: Emitting win notification to remaining player.');
                namespace.to(room_id).emit(EVENT, WsBaseResponse.error(
                    { outcome: 'opponent_disconnected', gameEnded: true },
                    [i18n.__('ws.games.playerDisconnected') || 'Your opponent disconnected. You win by forfeit!']
                ));

                logger.info('Chess Disconnect: Clearing turn timers for all remaining sockets in room.');
                const sockets = await namespace.in(room_id).fetchSockets();
                for (const s of sockets) {
                    clearTurnTimer(s);
                }
            }

            logger.info(`Chess Disconnect: Completed forfeit processing for player ${player_id} in room ${room_id}.`);

        } catch (err) {
            logger.error(`Chess Disconnect: Critical error in handler: ${err}`, { className: filename });
        }
    });
};
