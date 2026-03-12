const jwt = require('../../../../shared/util/jwt');
const WsBaseResponse = require('../../../../shared/util/wsBaseResponse');
const i18n = require('../../../../shared/language/i18n');
const util = require('../../../../shared/util/util');
const logger = require('../../../../shared/config/logger');
const path = require('path');
const filename = path.basename(__filename);
const Joi = require('joi');
const Room = require('../../../models/room.model');
const BattleshipPlacement = require('../../../models/battleshipPlacement.model');
const User = require('../../../models/user.model');
const { startTurnTimer, clearTurnTimer } = require('./timerUtils');

const EVENT = 'naval-battle';

const fireSchema = Joi.object({
    row: Joi.number().integer().min(0).max(9).required()
        .messages({ 'any.required': 'row.required', 'number.min': 'row.outOfBounds', 'number.max': 'row.outOfBounds' }),
    col: Joi.number().integer().min(0).max(9).required()
        .messages({ 'any.required': 'col.required', 'number.min': 'col.outOfBounds', 'number.max': 'col.outOfBounds' }),
});

module.exports = (socket, namespace) => {
    socket.on('fire', async (payload) => {
        let emitMsg;
        try {
            util.setLanguageToSocket(socket);

            const player_id = socket.data.player_id;
            const room_id = socket.data.room_id;

            // 1. Must have joined a room first
            if (!player_id || !room_id) {
                emitMsg = WsBaseResponse.error({}, ['You must join the room before firing.']);
                socket.emit(EVENT, emitMsg);
                return;
            }

            // 2. Must be this player's turn
            if (!socket.data.myTurn) {
                emitMsg = WsBaseResponse.error({}, ['It is not your turn.']);
                socket.emit(EVENT, emitMsg);
                return;
            }

            // 3. Validate payload
            const { error } = fireSchema.validate(payload, { abortEarly: false });
            if (error) {
                emitMsg = WsBaseResponse.error({}, error.details.map(d => d.message));
                socket.emit(EVENT, emitMsg);
                return;
            }

            const { row, col } = payload;

            // 4. Room must still be active
            const room = await Room.findById(room_id);
            if (!room || room.status !== 'started') {
                emitMsg = WsBaseResponse.error({}, ['Room is no longer active.']);
                socket.emit(EVENT, emitMsg);
                return;
            }

            // 4.1 Load the shooter's own placement (to record their shot)
            const shooterPlacement = await BattleshipPlacement.findOne({
                room_id,
                player_id: player_id,
            });

            if (!shooterPlacement) {
                emitMsg = WsBaseResponse.error({}, ['Your placement was not found.']);
                socket.emit(EVENT, emitMsg);
                return;
            }

            // Optional: prevent firing at the same exact cell twice
            const alreadyFired = shooterPlacement.shotsFired?.some(c => c[0] === row && c[1] === col);
            if (alreadyFired) {
                emitMsg = WsBaseResponse.error({}, ['You already fired at this coordinate!']);
                socket.emit(EVENT, emitMsg);
                return;
            }

            // 5. Find the opponent socket
            let opponentSocket = null;
            for (const [, s] of namespace.sockets) {
                if (s.data.room_id === room_id && s.data.player_id !== player_id) {
                    opponentSocket = s;
                    break;
                }
            }

            if (!opponentSocket) {
                emitMsg = WsBaseResponse.error({}, ['Opponent is not connected.']);
                socket.emit(EVENT, emitMsg);
                return;
            }

            // 6. Load opponent's placement (we fire at their ships)
            const opponentId = opponentSocket.data.player_id;
            const opponentPlacement = await BattleshipPlacement.findOne({
                room_id,
                player_id: opponentId,
            });

            if (!opponentPlacement) {
                emitMsg = WsBaseResponse.error({}, ['Opponent placement not found.']);
                socket.emit(EVENT, emitMsg);
                return;
            }

            // 7. Check hit/miss — find the targeted cell
            let hitShip = null;
            for (const ship of opponentPlacement.ships) {
                for (const cell of ship.cells) {
                    if (cell[0] === row && cell[1] === col) {
                        if (cell[2] === true) {
                            // Already hit — reject
                            emitMsg = WsBaseResponse.error({}, ['You already fired at this cell.']);
                            socket.emit(EVENT, emitMsg);
                            return;
                        }
                        hitShip = ship;
                        break;
                    }
                }
                if (hitShip) break;
            }

            let result = { row, col };

            // Record the shot in the shooter's database record
            shooterPlacement.shotsFired.push([row, col]);
            await shooterPlacement.save();

            if (!hitShip) {
                result.outcome = 'miss';
            } else {
                // To force Mongoose to save a deeply nested array of arrays change, 
                // we must replace the *entire* ships array with a new reference.
                const newShips = opponentPlacement.ships.map(ship => {
                    if (ship.startRow === hitShip.startRow && ship.startCol === hitShip.startCol) {
                        return {
                            ...ship.toObject ? ship.toObject() : ship,
                            cells: ship.cells.map(c => c[0] === row && c[1] === col ? [row, col, true] : [...c])
                        };
                    }
                    return ship;
                });
                
                // Assign the entirely new array back to the document
                opponentPlacement.ships = newShips;
                
                // Re-find the hit ship from the NEW array to calculate destruction status
                hitShip = newShips.find(s => s.startRow === hitShip.startRow && s.startCol === hitShip.startCol);

                const allCellsHit = hitShip.cells.every(c => c.length === 3 && c[2] === true);
                if (allCellsHit) {
                    hitShip.status = 'destroyed';
                    result.outcome = 'sunk';
                    result.shipType = hitShip.type;
                } else {
                    result.outcome = 'hit';
                    result.shipType = hitShip.type;
                }

                opponentPlacement.markModified('ships');
                await opponentPlacement.save();

                // 8. Win condition — all ships destroyed
                // Use the shooter's shotsFired array to perfectly match against all opponent ships
                let totalShipCells = 0;
                let hitShipCells = 0;
                
                for (const ship of opponentPlacement.ships) {
                    for (const cell of ship.cells) {
                        totalShipCells++;
                        const isHit = shooterPlacement.shotsFired.some(shot => shot[0] === cell[0] && shot[1] === cell[1]);
                        if (isHit) hitShipCells++;
                    }
                }

                const allDestroyed = totalShipCells > 0 && hitShipCells === totalShipCells;

                if (allDestroyed) {
                    result.outcome = 'win';

                    // Clear both timers — game over
                    clearTurnTimer(socket);
                    clearTurnTimer(opponentSocket);

                    room.status = 'finished';
                    room.winner = player_id;
                    room.finished_at = new Date();
                    await room.save();

                    const prize = room.bet_amount * 2 * (1 - room.house_edge / 100);
                    // await User.findByIdAndUpdate(player_id, { $inc: { balance: prize } });

                    emitMsg = WsBaseResponse.success(
                        { outcome: 'win', row, col, shipType: result.shipType, prize, yourTurn: false, gameEnded: true },
                        ['You sank the last ship! You win!']
                    );
                    socket.emit(EVENT, emitMsg);

                    opponentSocket.emit(EVENT, WsBaseResponse.success(
                        { outcome: 'lose', row, col, shipType: result.shipType, yourTurn: false, gameEnded: true },
                        ['All your ships have been sunk. You lose!']
                    ));
                    
                    // Notify the global lobby that this room is gone
                    const { getIo } = require('../../../../shared/config/ws');
                    const io = getIo();
                    if (io) {
                        io.of('/rooms').emit('roomDeleted', { id: room_id });
                    }
                    
                    return;
                }
            }

            // 9. Valid non-winning shot — clear current timer, swap turns, start new timer
            clearTurnTimer(socket);

            socket.data.myTurn = false;
            opponentSocket.data.myTurn = true;

            const timerSeconds = socket.data.turnTimerSeconds ?? 30;

            // Notify current player (shooter)
            emitMsg = WsBaseResponse.success(
                { ...result, yourTurn: false, turnTimerSeconds: timerSeconds },
                [result.outcome === 'miss'
                    ? 'Miss!'
                    : result.outcome === 'sunk'
                        ? `You sank the ${result.shipType}!`
                        : `Hit on ${result.shipType}!`]
            );
            socket.emit(EVENT, emitMsg);

            // Notify opponent (receiver)
            const opponentMsg = result.outcome === 'miss'
                ? 'Opponent missed! Your turn.'
                : result.outcome === 'sunk'
                    ? `Opponent sank your ${result.shipType}! Your turn.`
                    : `Opponent hit your ${result.shipType}! Your turn.`;

            opponentSocket.emit(EVENT, WsBaseResponse.success(
                { outcome: result.outcome === 'miss' ? 'miss' : result.outcome, row, col, shipType: result.shipType, yourTurn: true, turnTimerSeconds: timerSeconds },
                [opponentMsg]
            ));

            // Start turn timer for the opponent
            startTurnTimer(opponentSocket, socket, namespace, room_id, timerSeconds);

            logger.info(
                `Naval-battle fire: player ${player_id} → [${row},${col}] = ${result.outcome}. Next: ${opponentId}`,
                { className: filename }
            );

        } catch (err) {
            logger.error(`Error in naval-battle fire: ${err}`, { className: filename });
            emitMsg = WsBaseResponse.error({}, ['An error occurred processing your shot.']);
            socket.emit(EVENT, emitMsg);
        }
    });
};
