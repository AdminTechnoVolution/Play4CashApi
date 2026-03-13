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

            // Atomically pull the user from the players array
            const updatedRoom = await Room.findOneAndUpdate(
                { _id: room_id, 'players.playerId': player_id },
                { $pull: { players: { playerId: player_id } } },
                { new: true }
            );

            // If updatedRoom is null, the user wasn't in the room (or room deleted)
            if (!updatedRoom) return;

            // If the room is already finished, ignore the rest of the disconnect logic
            if (updatedRoom.status === 'finished') {
                logger.info(`Player ${player_id} disconnected from finished room ${room_id}`, { className: filename });
                return;
            }

            // If the room was waiting, the game hasn't started yet. No one wins a forfeit.
            // We just check if the leaving player had already paid by setting their ships.
            if (updatedRoom.status === 'waiting') {

                // Did THIS leaving user already place ships? If so, they paid. Refund them.
                const BattleshipPlacement = require('../../../models/battleshipPlacement.model');
                const placement = await BattleshipPlacement.findOne({ room_id: room_id, player_id: player_id });
                if (placement) {
                    await User.updateOne({ _id: player_id }, { $inc: { balance: updatedRoom.bet_amount } });
                    await BattleshipPlacement.findByIdAndDelete(placement._id);
                }

                if (updatedRoom.players.length === 0) {
                    // We only delete if it's STILL empty (in case someone joined in the last microsecond)
                    const deletedRoom = await Room.findOneAndDelete({ _id: room_id, players: { $size: 0 } });
                    
                    if (deletedRoom) {
                        // Notify via global lobby that this room is gone
                        const { getIo } = require('../../../../shared/config/ws');
                        const io = getIo();
                        if (io) {
                            io.of('/rooms').emit('roomDeleted', { id: room_id });
                        }

                        logger.info(`Player ${player_id} closed waiting room ${room_id} by disconnecting`, { className: filename });
                        return;
                    }
                } else {
                    // There is still someone in the room. Just notify them that the opponent left the lobby.
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
                    }
                    if (io) {
                         const populatedRoom = await Room.findById(room_id).populate('game_id', '-created_at').populate('players.playerId', 'username').lean();
                         if (populatedRoom.game_id && populatedRoom.game_id.name) {
                             populatedRoom.game_id = {
                                 ...populatedRoom.game_id,
                                 name: populatedRoom.game_id.name.en,
                                 description: populatedRoom.game_id.description.en,
                             };
                         }
                         io.of('/rooms').emit('roomUpdated', populatedRoom);
                    }
                    
                    logger.info(`Player ${player_id} left waiting room ${room_id}, but room remains open`, { className: filename });
                    return;
                }
            }

            // Otherwise, it was started (both players had placed ships and paid).
            // The remaining player wins by forfeit.
            updatedRoom.status = 'finished';
            updatedRoom.winner = updatedRoom.players[0]?.playerId; // The remaining player wins
            updatedRoom.finished_at = new Date();

            // Award prize to the remaining player
            const prize = updatedRoom.bet_amount * 2 * (1 - updatedRoom.house_edge / 100);
            await User.updateOne({ _id: updatedRoom.winner }, { $inc: { balance: prize } });

            await updatedRoom.save();

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
