const path = require('path');
const logger = require('../../shared/config/logger');
const filename = path.basename(__filename);
const Room = require('../models/room.model');
const Game = require('../models/game.model');
const BaseResponse = require('../../shared/util/baseResponse');
const BusinessException = require('../../shared/exceptionHandler/BusinessException');
const DataLayerException = require('../../shared/exceptionHandler/DataLayerException');
const { getValueFromJwtToken } = require('../../shared/util/jwt');
const { getIo } = require('../../shared/config/ws');
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

module.exports = { getRooms, getRoom, createRoom, joinRoom, setReady, deleteRoom };
