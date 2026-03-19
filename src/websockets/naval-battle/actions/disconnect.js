const WsBaseResponse = require('../../../../shared/util/wsBaseResponse');
const i18n = require('../../../../shared/language/i18n');
const logger = require('../../../../shared/config/logger');
const path = require('path');
const filename = path.basename(__filename);
const Room = require('../../../models/room.model');
const User = require('../../../models/user.model');

const EVENT = 'naval-battle';

module.exports = (socket, namespace) => {
    socket.on('disconnect', async () => {
        try {
            const { player_id, room_id } = socket.data;

            if (!room_id) return; // Never joined a room properly

            // Peek at the room first WITHOUT modifying the players array
            const room = await Room.findOne({ _id: room_id, 'players.playerId': player_id });

            // User wasn't in the room (or room deleted)
            if (!room) return;

            // If the room is already finished, nothing to do
            if (room.status === 'finished') {
                logger.info(`Player ${player_id} disconnected from finished room ${room_id}`, { className: filename });
                return;
            }

            // ── WAITING ─────────────────────────────────────────────────────────────
            // Game hasn't started — safe to pull the player out
            if (room.status === 'waiting') {
                const updatedRoom = await Room.findOneAndUpdate(
                    { _id: room_id, 'players.playerId': player_id },
                    { $pull: { players: { playerId: player_id } } },
                    { new: true }
                );
                if (!updatedRoom) return;

                // Did THIS leaving user already place ships? If so, they paid. Refund them.
                const BattleshipPlacement = require('../../../models/battleshipPlacement.model');
                const placement = await BattleshipPlacement.findOne({ room_id: room_id, player_id: player_id });
                if (placement) {
                    await User.updateOne({ _id: player_id }, { $inc: { balance: updatedRoom.bet_amount } });
                    await BattleshipPlacement.findByIdAndDelete(placement._id);
                }

                if (updatedRoom.players.length === 0) {
                    const deletedRoom = await Room.findOneAndDelete({ _id: room_id, players: { $size: 0 } });
                    if (deletedRoom) {
                        const { getIo } = require('../../../../shared/config/ws');
                        const io = getIo();
                        if (io) {
                            io.of('/rooms').emit('roomDeleted', { id: room_id });
                        }
                        logger.info(`Player ${player_id} closed waiting room ${room_id} by disconnecting`, { className: filename });
                        return;
                    }
                } else {
                    const { getIo } = require('../../../../shared/config/ws');
                    const io = getIo();
                    if (io) {
                        const sockets = await io.of('/naval-battle').in(room_id).fetchSockets();
                        for (const s of sockets) {
                            if (s.id !== socket.id) {
                                const playerLang = s.handshake?.headers?.['accept-language'] || 'en';
                                s.emit(EVENT, WsBaseResponse.success(
                                    { opponentLeft: true, waitingForOpponent: true },
                                    [i18n.__({phrase: 'ws.games.opponentLeft', locale: playerLang}) || 'Opponent abandoned the pre-game lobby.']
                                ));
                            }
                        }
                        const populatedRoom = await Room.findById(room_id).populate('game_id', '-created_at').populate('players.playerId', 'username').lean();
                        if (populatedRoom?.game_id?.name) {
                            populatedRoom.game_id = {
                                ...populatedRoom.game_id,
                                name: populatedRoom.game_id.name.en,
                                description: populatedRoom.game_id.description?.en,
                            };
                        }
                        io.of('/rooms').emit('roomUpdated', populatedRoom);
                    }
                    logger.info(`Player ${player_id} left waiting room ${room_id}, but room remains open`, { className: filename });
                }
                return;
            }

            // ── STARTED ─────────────────────────────────────────────────────────────
            // Game was in progress — finish the room WITHOUT removing the leaving player
            // so that both players remain in the document for history queries.
            const winner_id = room.players.find(p => p.playerId.toString() !== player_id)?.playerId;

            room.status = 'finished';
            room.winner = winner_id;
            room.finished_at = new Date();
            await room.save();

            // Award prize to the winner
            const prize = room.bet_amount + (room.bet_amount * (1 - room.house_edge / 100));
            await User.updateOne({ _id: winner_id }, { $inc: { balance: prize } });

            // Notify the global lobby and the specific room
            const { getIo } = require('../../../../shared/config/ws');
            const io = getIo();
            if (io) {
                io.of('/rooms').emit('roomDeleted', { id: room_id });

                const sockets = await io.of('/naval-battle').in(room_id).fetchSockets();
                for (const s of sockets) {
                    if (s.id !== socket.id) {
                        const playerLang = s.handshake?.headers?.['accept-language'] || 'en';
                        s.emit(EVENT, WsBaseResponse.error(
                            { outcome: 'opponent_disconnected', gameEnded: true },
                            [i18n.__({phrase: 'ws.games.playerDisconnected', locale: playerLang}) || 'Your opponent disconnected. You win by forfeit!']
                        ));
                    }
                }
            }

            logger.info(`Player ${player_id} forfeit by disconnecting from naval-battle room ${room_id}`, { className: filename });
        } catch (err) {
            logger.error(`Error in naval-battle disconnect: ${err}`, { className: filename });
        }
    });
};
