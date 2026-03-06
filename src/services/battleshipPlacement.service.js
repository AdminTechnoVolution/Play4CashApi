const path = require('path');
const logger = require('../../shared/config/logger');
const filename = path.basename(__filename);
const BattleshipPlacement = require('../models/battleshipPlacement.model');
const Room = require('../models/room.model');
const BaseResponse = require('../../shared/util/baseResponse');
const BusinessException = require('../../shared/exceptionHandler/BusinessException');
const DataLayerException = require('../../shared/exceptionHandler/DataLayerException');
const { getValueFromJwtToken } = require('../../shared/util/jwt');

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

        // 5. Save placement — unique index raises code 11000 on duplicate
        const placement = new BattleshipPlacement({ room_id: roomId, player_id, ships });
        await placement.save();

        // 6. Auto-mark this player as ready in the room
        player.ready = true;

        // 7. If room is full and everyone is ready → start the game
        const maxPlayers = room.game_id?.max_players;
        const roomFull = maxPlayers && room.players.length >= maxPlayers;
        const allReady = room.players.every(p => p.ready);

        if (roomFull && allReady) {
            room.status = 'started';
        }

        await room.save();

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
