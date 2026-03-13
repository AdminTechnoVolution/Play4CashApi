const path = require('path');
const logger = require('../../shared/config/logger');
const filename = path.basename(__filename);
const BattleshipPlacement = require('../models/battleshipPlacement.model');
const Room = require('../models/room.model');
const User = require('../models/user.model');
const BaseResponse = require('../../shared/util/baseResponse');
const BusinessException = require('../../shared/exceptionHandler/BusinessException');
const DataLayerException = require('../../shared/exceptionHandler/DataLayerException');
const { getValueFromJwtToken } = require('../../shared/util/jwt');
const { getIo } = require('../../shared/config/ws');
const i18n = require('../../shared/language/i18n');

const SHIP_SIZES = {
    carrier: 5,
    battleship: 4,
    cruiser: 3,
    submarine: 3,
    destroyer: 2,
};
const REQUIRED_TYPES = Object.keys(SHIP_SIZES);

// ─── Business-level validation (beyond Joi schema) ────────────────────────────

function validateShipLogic(ships) {
    const types = ships.map(s => s.type);
    const typeSet = new Set(types);

    for (const t of REQUIRED_TYPES) {
        if (!typeSet.has(t)) return `Missing ship type: ${t}.`;
    }
    if (types.length !== typeSet.size) return 'Duplicate ship types are not allowed.';

    const allCellKeys = [];
    for (const ship of ships) {
        const expectedSize = SHIP_SIZES[ship.type];
        if (ship.cells.length !== expectedSize) {
            return `Ship "${ship.type}" must have exactly ${expectedSize} cells, got ${ship.cells.length}.`;
        }

        for (const cell of ship.cells) {
            if (
                !Array.isArray(cell) || cell.length !== 2 ||
                typeof cell[0] !== 'number' || typeof cell[1] !== 'number' ||
                cell[0] < 0 || cell[0] > 9 || cell[1] < 0 || cell[1] > 9
            ) {
                return `Ship "${ship.type}" has an out-of-bounds cell: [${cell}]. All values must be 0–9.`;
            }
            allCellKeys.push(`${cell[0]},${cell[1]}`);
        }
    }

    const cellSet = new Set(allCellKeys);
    if (cellSet.size !== allCellKeys.length) {
        return 'Ships overlap — two or more ships share the same cell.';
    }

    return null;
}

// ─── Service ──────────────────────────────────────────────────────────────────

const savePlacement = async (req) => {
    try {
        const { roomId } = req.params;
        const { ships } = req.body;
        const auth = req.headers['authorization'];
        const player_id = getValueFromJwtToken(auth, 'id');

        // 1. Business-level ship logic validation
        const logicError = validateShipLogic(ships);
        if (logicError) throw new BusinessException(logicError, 400);

        // 2. Room must exist (populate game for max_players check later)
        const room = await Room.findById(roomId).populate('game_id', 'max_players');
        if (!room) throw new BusinessException('Room not found', 404);

        // 3. Room must be in waiting status
        if (room.status !== 'waiting') {
            throw new BusinessException('Ships can only be placed while the room is in waiting status.', 400);
        }

        // 4. Player must be a member of the room
        const player = room.players.find(p => p.playerId.toString() === player_id);
        if (!player) throw new BusinessException('You are not a member of this room', 403);

        // 5. Check if they already placed ships (e.g., Opponent 1 left, so they are waiting for Opponent 2)
        let placement;
        const existingPlacement = await BattleshipPlacement.findOne({ room_id: roomId, player_id });

        if (existingPlacement) {
            // Player already paid and placed ships previously. Just update them to avoid double-charging.
            existingPlacement.ships = ships;
            await existingPlacement.save();
            placement = existingPlacement;
        } else {
            // New placement. Deduct the bet amount from the user's balance atomically.
            const user = await User.findOneAndUpdate(
                { _id: player_id, balance: { $gte: room.bet_amount } },
                { $inc: { balance: -room.bet_amount } },
                { new: true }
            );
            if (!user) throw new BusinessException('ERROR_WITHDRAWAL_INSUFFICIENT_BALANCE', 400);

            // Save placement
            placement = new BattleshipPlacement({ room_id: roomId, player_id, ships });
            try {
                await placement.save();
            } catch (saveErr) {
                // If a race condition caused a save error right after deduction, refund the user!
                await User.updateOne({ _id: player_id }, { $inc: { balance: room.bet_amount } });
                throw saveErr;
            }
        }

        // 7. Auto-mark this player as ready in the room
        player.ready = true;

        // 7. If room is full and everyone is ready → start the game
        const maxPlayers = room.game_id?.max_players;
        const roomFull = maxPlayers && room.players.length >= maxPlayers;
        const allReady = room.players.every(p => p.ready);

        if (roomFull && allReady) {
            room.status = 'started';
        }

        await room.save();

        if (room.status === 'started') {
            const io = getIo();
            if (io) {
                const namespace = io.of('/naval-battle');
                const timerSeconds = room.game_id?.turn_timer_seconds ?? 30;
                
                // Get sockets in room
                const socketsInRoom = await namespace.in(roomId).fetchSockets();
                
                // Determine language based on headers
                const language = req.headers['accept-language'] || 'en';
                
                if (socketsInRoom.length === 2) {
                    const firstPlayer = socketsInRoom[0];
                    const secondPlayer = socketsInRoom[1];

                    // Store timer duration on each socket for later use in fire.js
                    firstPlayer.data.turnTimerSeconds = timerSeconds;
                    secondPlayer.data.turnTimerSeconds = timerSeconds;
                    
                    firstPlayer.data.myTurn = true;
                    secondPlayer.data.myTurn = false;

                    // Notify both players
                    firstPlayer.emit('naval-battle', {
                        success: true,
                        data: { yourTurn: true, turnTimerSeconds: timerSeconds, waitingForOpponent: false },
                        messages: [i18n.__({phrase: 'ws.games.opponentReady', locale: language}) || 'Opponent is ready. Your turn — fire!']
                    });
                    
                    secondPlayer.emit('naval-battle', {
                        success: true,
                        data: { yourTurn: false, turnTimerSeconds: timerSeconds, waitingForOpponent: false },
                        messages: [i18n.__({phrase: 'ws.games.opponentReadyWait', locale: language}) || 'Enemy ships detected. Waiting for opponent to fire.']
                    });

                    // Start the timer for the first player
                    const { startTurnTimer } = require('../websockets/naval-battle/actions/timerUtils');
                    startTurnTimer(firstPlayer, secondPlayer, namespace, roomId, timerSeconds);

                    logger.info(`REST API broadcasted game start for room ${roomId}`, { className: filename });
                }
                
                // ALSO notify the global /rooms lobby that this room is now "started"
                // (Populate it identically to getRooms so the frontend can replace the object)
                const populatedRoom = await Room.findById(roomId)
                    .populate('game_id', '-created_at')
                    .populate('players.playerId', 'username')
                    .lean();

                // localizeRooms is not imported here, we need to import it or recreate the logic
                // Importing from room.service.js could cause circular dependency, so let's just 
                // do the localization here since it's just a language check.
                if (populatedRoom.game_id && populatedRoom.game_id.name) {
                    populatedRoom.game_id = {
                        ...populatedRoom.game_id,
                        name: language === 'es' ? populatedRoom.game_id.name.es : populatedRoom.game_id.name.en,
                        description: language === 'es' ? populatedRoom.game_id.description.es : populatedRoom.game_id.description.en,
                    };
                }
                
                io.of('/rooms').emit('roomUpdated', populatedRoom);
            }
        }

        return new BaseResponse(true, [], { message: 'Placement saved', status: placement.status, roomStatus: room.status });
    } catch (err) {
        if (err instanceof BusinessException) throw err;
        if (err.code === 11000) {
            throw new BusinessException('You have already submitted your placement for this room', 409);
        }
        logger.error(`Error saving battleship placement: ${err}`, { className: filename });
        throw new DataLayerException('ERROR_GENERIC_RESPONSE');
    }
};


module.exports = { savePlacement };
