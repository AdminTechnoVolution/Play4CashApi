const path = require('path');
const logger = require('../../shared/config/logger');
const filename = path.basename(__filename);
const Room = require('../models/room.model');
const BattleshipPlacement = require('../models/battleshipPlacement.model');
const Game = require('../models/game.model');
const User = require('../models/user.model');
const BaseResponse = require('../../shared/util/baseResponse');
const BusinessException = require('../../shared/exceptionHandler/BusinessException');
const DataLayerException = require('../../shared/exceptionHandler/DataLayerException');
const { getValueFromJwtToken } = require('../../shared/util/jwt');
const { getIo } = require('../../shared/config/ws');
const i18n = require('../../shared/language/i18n');
const { LANGUAGE_ES, LANGUAGE_EN } = require('../../shared/util/constants');
const util = require('../../shared/util/util');

// ─── GET ROOMS ───────────────────────────────────────────────────────────────

const getRooms = async (req) => {
    try {
        const { game_id } = req.params;
        const filter = {
            game_id,
            status: { $in: ['waiting', 'started'] }
        };

        const rooms = await Room.find(filter)
            .populate('game_id', '-created_at')
            .populate('players.playerId', 'username')
            .select('-finished_at -winner')
            .lean();

        const enriched = localizeRooms(req, rooms);
        return new BaseResponse(true, [], enriched);
    } catch (err) {
        logger.error(`Error getting rooms: ${err}`, { className: filename });
        throw new DataLayerException('ERROR_GENERIC_RESPONSE');
    }
};

// ─── GET SINGLE ROOM ─────────────────────────────────────────────────────────

const getRoom = async (req) => {
    try {
        const room = await Room.findById(req.params.id)
            .populate('game_id', '-created_at')
            .populate('players.playerId', 'username')
            .lean();

        if (!room) throw new BusinessException('ERROR_NOT_FOUND', 404);

        const [enriched] = localizeRooms(req, [room]);
        return new BaseResponse(true, [], enriched);
    } catch (err) {
        if (err instanceof BusinessException) throw err;
        logger.error(`Error getting room: ${err}`, { className: filename });
        throw new DataLayerException('ERROR_GENERIC_RESPONSE');
    }
};

// ─── CREATE ROOM ─────────────────────────────────────────────────────────────

const createRoom = async (req) => {
    try {
        const auth = req.headers['authorization'];
        const user_id = getValueFromJwtToken(auth, 'id');

        const { game_id, bet_amount, public: isPublic, name } = req.body;

        // Validate game exists and bet is valid
        const game = await Game.findById(game_id);
        if (!game) throw new BusinessException('ERROR_NOT_FOUND', 404);
        if (bet_amount < game.min_bet) throw new BusinessException('ERROR_BAD_REQUEST_RESPONSE', 400);

        // Validate user has enough balance to cover the bet
        const user = await User.findById(user_id);
        if (!user || user.balance < bet_amount) {
            throw new BusinessException('ERROR_WITHDRAWAL_INSUFFICIENT_BALANCE', 400);
        }

        // Unique room code
        const code = util.generateRoomCode ? util.generateRoomCode(16) : require('crypto').randomBytes(8).toString('hex');

        const room = new Room({
            name: name || null,
            code,
            game_id,
            bet_amount,
            house_edge: game.house_edge,
            public: isPublic,
            players: [{ playerId: user_id, ready: false }],
        });

        await room.save();

        const populatedRoom = await Room.findById(room._id)
            .populate('game_id', '-created_at')
            .populate('players.playerId', 'username')
            .lean();
        const [enriched] = localizeRooms(req, [populatedRoom]);

        const io = getIo();
        if (io) {
            io.of('/rooms').emit('roomCreated', enriched);
        }

        return new BaseResponse(true, [], room);
    } catch (err) {
        if (err instanceof BusinessException) throw err;
        logger.error(`Error creating room: ${err}`, { className: filename });
        throw new DataLayerException('ERROR_GENERIC_RESPONSE');
    }
};

// ─── JOIN ROOM ────────────────────────────────────────────────────────────────

const joinRoom = async (req) => {
    try {
        const auth = req.headers['authorization'];
        const user_id = getValueFromJwtToken(auth, 'id');
        const { id } = req.params;

        const roomInfo = await Room.findById(id).populate('game_id');
        if (!roomInfo) throw new BusinessException('ERROR_NOT_FOUND', 404);
        if (roomInfo.status !== 'waiting') throw new BusinessException('ERROR_ROOM_NOT_WAITING', 400);

        const maxPlayers = roomInfo.game_id.max_players;

        // Check if user is already in the room
        const alreadyIn = roomInfo.players.some(p => p.playerId.toString() === user_id);
        if (alreadyIn) throw new BusinessException('ERROR_ROOM_ALREADY_IN', 400);

        // Validate user has enough balance to cover the bet
        const user = await User.findById(user_id);
        if (!user || user.balance < roomInfo.bet_amount) {
            throw new BusinessException('ERROR_WITHDRAWAL_INSUFFICIENT_BALANCE', 400);
        }

        // Perform an atomic update to prevent race conditions during concurrent "joins"
        const room = await Room.findOneAndUpdate(
            {
                _id: id,
                status: 'waiting',
                // If maxPlayers is 2, ensure the index 1 (the 2nd slot) doesn't exist yet
                [`players.${maxPlayers - 1}`]: { $exists: false },
                'players.playerId': { $ne: user_id }
            },
            {
                $push: { players: { playerId: user_id, ready: false } }
            },
            { new: true }
        ).populate('game_id');

        // If 'room' is null, the atomic condition failed (it was full, started, or user already joined)
        if (!room) {
            // Re-fetch to give an accurate error message
            const currentRoom = await Room.findById(id);
            if (!currentRoom) throw new BusinessException('ERROR_NOT_FOUND', 404);
            if (currentRoom.status !== 'waiting') throw new BusinessException('ERROR_ROOM_NOT_WAITING', 400);
            
            const alreadyIn = currentRoom.players.some(p => p.playerId.toString() === user_id);
            if (alreadyIn) throw new BusinessException('ERROR_ROOM_ALREADY_IN', 400);

            if (currentRoom.players.length >= maxPlayers) throw new BusinessException('ERROR_ROOM_FULL', 400);
            
            throw new BusinessException('ERROR_ROOM_FULL', 400); // Fallback
        }

        const populatedRoom = await Room.findById(room._id)
            .populate('game_id', '-created_at')
            .populate('players.playerId', 'username')
            .lean();
        const [enriched] = localizeRooms(req, [populatedRoom]);

        const io = getIo();
        if (io) {
            io.of('/rooms').emit('roomUpdated', enriched);
        }

        return new BaseResponse(true, [], room);
    } catch (err) {
        if (err instanceof BusinessException) throw err;
        logger.error(`Error joining room: ${err}`, { className: filename });
        throw new DataLayerException('ERROR_GENERIC_RESPONSE');
    }
};

// ─── SET READY ────────────────────────────────────────────────────────────────

const setReady = async (req) => {
    try {
        const auth = req.headers['authorization'];
        const user_id = getValueFromJwtToken(auth, 'id');
        const { id } = req.params;
        const { ready } = req.body;

        const room = await Room.findById(id).populate('game_id', 'max_players');
        if (!room) throw new BusinessException('ERROR_NOT_FOUND', 404);
        if (room.status !== 'waiting') throw new BusinessException('ERROR_BAD_REQUEST_RESPONSE', 400);

        const player = room.players.find(p => p.playerId.toString() === user_id);
        if (!player) throw new BusinessException('ERROR_AUTH', 403);
        if (player.ready) throw new BusinessException('ERROR_PLAYER_ALREADY_READY', 400);

        player.ready = ready;

        // Auto-start: room is full AND every player is ready
        const maxPlayers = room.game_id?.max_players;
        const roomFull = maxPlayers && room.players.length >= maxPlayers;
        const allReady = room.players.every(p => p.ready);

        if (roomFull && allReady) {
            room.status = 'started';
        }

        await room.save();

        const populatedRoom = await Room.findById(room._id)
            .populate('game_id', '-created_at')
            .populate('players.playerId', 'username')
            .lean();
        const [enriched] = localizeRooms(req, [populatedRoom]);

        const io = getIo();
        if (io) {
            io.of('/rooms').emit('roomUpdated', enriched);
        }

        return new BaseResponse(true, [], room);
    } catch (err) {
        if (err instanceof BusinessException) throw err;
        logger.error(`Error setting ready: ${err}`, { className: filename });
        throw new DataLayerException('ERROR_GENERIC_RESPONSE');
    }
};


// ─── DELETE ROOM ──────────────────────────────────────────────────────────────

const deleteRoom = async (req) => {
    try {
        const room = await Room.findByIdAndDelete(req.params.id);
        if (!room) throw new BusinessException('ERROR_NOT_FOUND', 404);

        const io = getIo();
        if (io) {
            io.of('/rooms').emit('roomDeleted', { id: req.params.id });
        }

        return new BaseResponse(true, []);
    } catch (err) {
        if (err instanceof BusinessException) throw err;
        logger.error(`Error deleting room: ${err}`, { className: filename });
        throw new DataLayerException('ERROR_GENERIC_RESPONSE');
    }
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────

const localizeRooms = (req, rooms) => {
    const language = req.headers['accept-language'] || LANGUAGE_EN;
    return rooms.map(room => {
        if (room.game_id && room.game_id.name) {
            room.game_id = {
                ...room.game_id,
                name: language === LANGUAGE_ES ? room.game_id.name.es : room.game_id.name.en,
                description: language === LANGUAGE_ES ? room.game_id.description.es : room.game_id.description.en,
            };
        }
        return room;
    });
};

// ─── LEAVE ROOM ───────────────────────────────────────────────────────────────

const leaveRoom = async (req) => {
    try {
        const auth = req.headers['authorization'];
        const user_id = getValueFromJwtToken(auth, 'id');
        const language = req.headers['accept-language'] || 'en';
        const { id } = req.params;

        const io = getIo();

        // Atomically pull the user from the players array
        // We use new: true to see what the room looks like exactly after they were removed
        const updatedRoom = await Room.findOneAndUpdate(
            { _id: id, 'players.playerId': user_id },
            { $pull: { players: { playerId: user_id } } },
            { new: true }
        );

        // If updatedRoom is null, the user wasn't in the room (or room deleted)
        if (!updatedRoom) throw new BusinessException('ERROR_AUTH', 403);

        // If the room is already finished, ignore the rest of the leave logic
        if (updatedRoom.status === 'finished') {
            return new BaseResponse(true, [], updatedRoom);
        }

        // If the room was waiting, the game hasn't started yet. No one wins a forfeit.
        // We just check if the leaving player had already paid by setting their ships.
        if (updatedRoom.status === 'waiting') {

            // Did THIS leaving user already place ships? If so, they paid. Refund them.
            const placement = await BattleshipPlacement.findOne({ room_id: id, player_id: user_id });
            if (placement) {
                // Refund them, because the game never started
                await User.updateOne({ _id: user_id }, { $inc: { balance: updatedRoom.bet_amount } });
                await BattleshipPlacement.findByIdAndDelete(placement._id); // Cleanup their old placement
            }

            if (updatedRoom.players.length === 0) {
                // We only delete if it's STILL empty (in case someone joined in the last microsecond)
                const deletedRoom = await Room.findOneAndDelete({ _id: id, players: { $size: 0 } });
                
                if (deletedRoom) {
                    if (io) {
                        io.of('/rooms').emit('roomDeleted', { id: id });
                        io.of('/naval-battle').to(id).emit('naval-battle', {
                            success: false,
                            data: { outcome: 'match_cancelled', gameEnded: true },
                            messages: [i18n.__({phrase: 'ws.games.matchCancelled', locale: language}) || 'The game was cancelled before starting']
                        });
                    }
                    return new BaseResponse(true, [], { status: 'deleted' });
                }
            } else {
                // There is still someone in the room. Just notify them that the opponent left the lobby.
                if (io) {
                    const populatedRoom = await Room.findById(id).populate('game_id', '-created_at').populate('players.playerId', 'username').lean();
                    const [enriched] = localizeRooms(req, [populatedRoom]);
                    io.of('/rooms').emit('roomUpdated', enriched);
                    
                    // Iterate over sockets to avoid emitting back to the player who just left via REST
                    const sockets = await io.of('/naval-battle').in(id).fetchSockets();
                    for (const s of sockets) {
                        if (s.data && s.data.player_id !== user_id) {
                            // Extract other player's language from their socket if possible, fallback to request header
                            const playerLanguage = s.handshake?.headers?.['accept-language'] || language;
                            s.emit('naval-battle', {
                                success: true,
                                data: { opponentLeft: true, waitingForOpponent: true },
                                messages: [i18n.__({phrase: 'ws.games.opponentLeft', locale: playerLanguage}) || 'Opponent abandoned the pre-game lobby.']
                            });
                        }
                    }
                }
                return new BaseResponse(true, [], updatedRoom);
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

        if (io) {
            // Tell the global lobby this room is gone
            io.of('/rooms').emit('roomDeleted', { id: id });
            // Warn the remaining room participant the game was forfeit (don't tell the leaver they won!)
            const sockets = await io.of('/naval-battle').in(id).fetchSockets();
            for (const s of sockets) {
                if (s.data && s.data.player_id !== user_id) {
                    const playerLanguage = s.handshake?.headers?.['accept-language'] || language;
                    s.emit('naval-battle', {
                        success: false,
                        data: { outcome: 'opponent_disconnected', gameEnded: true },
                        messages: [i18n.__({phrase: 'ws.games.playerDisconnected', locale: playerLanguage}) || 'Your opponent disconnected. You win by forfeit!']
                    });
                }
            }
        }

        return new BaseResponse(true, [], updatedRoom);
    } catch (err) {
        if (err instanceof BusinessException) throw err;
        logger.error(`Error leaving room: ${err}`, { className: filename });
        throw new DataLayerException('ERROR_GENERIC_RESPONSE');
    }
};

module.exports = { getRooms, getRoom, createRoom, joinRoom, setReady, deleteRoom, leaveRoom };
