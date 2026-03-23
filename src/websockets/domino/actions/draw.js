const WsBaseResponse = require('../../../../shared/util/wsBaseResponse');
const i18n = require('../../../../shared/language/i18n');
const logger = require('../../../../shared/config/logger');
const path = require('path');
const filename = path.basename(__filename);
const DominoGame = require('../../../models/dominoGame.model');
const Room = require('../../../models/room.model');
const { hasValidMoves } = require('./gameLogic');

const EVENT = 'domino';

module.exports = (socket, namespace) => {
    socket.on('draw', async () => {
        try {
            const player_id = socket.data.player_id;
            const room_id = socket.data.room_id;

            const game = await DominoGame.findOne({ room_id });
            if (!game || game.status !== 'active') return;

            const currentPlayerId = game.player_ids[game.current_player_index].toString();
            if (currentPlayerId !== player_id) {
                socket.emit(EVENT, WsBaseResponse.error({}, [i18n.__('ws.games.notYourTurn')]));
                return;
            }

            const hand = game.hands.get(player_id);
            if (hasValidMoves(hand, game.open_ends)) {
                socket.emit(EVENT, WsBaseResponse.error({}, [i18n.__('ws.games.mustMoveBeforeDraw') || 'You must play if you have a valid move.']));
                return;
            }

            if (game.boneyard.length === 0) {
                socket.emit(EVENT, WsBaseResponse.error({}, ['Boneyard is empty. You must pass if you have no moves.']));
                return;
            }

            // Draw a tile
            const tile = game.boneyard.pop();
            hand.push(tile);
            game.hands.set(player_id, hand);
            
            await game.save();

            // Record draw in Room players history
            await Room.updateOne(
                { _id: room_id, 'players.playerId': player_id },
                { $push: { 'players.$.moves': { data: { tile, type: 'draw' } } } }
            );

            // Notify the player of their new tile (private)
            socket.emit(EVENT, WsBaseResponse.success({
                hand: hand,
                boneyardCount: game.boneyard.length,
                yourTurn: true // In Double-6, drawing doesn't automatically end turn
            }, ['You drew a tile from the boneyard.']));

            // Notify others + unify broadcast structure (Public)
            const socketsInRoom = await namespace.in(room_id).fetchSockets();
            const roomData = await Room.findById(room_id).populate('game_id', 'turn_timer_seconds');
            const timerSeconds = roomData?.game_id?.turn_timer_seconds ?? 30;

            for (const s of socketsInRoom) {
                // The drawing player already got a specific message, but we can also include it here for unity
                // or just skip them. Let's send to everyone for maximum consistency.
                const isDrawingPlayer = s.data.player_id.toString() === player_id;
                
                s.emit(EVENT, WsBaseResponse.success({
                    board: game.board,
                    hand: game.hands.get(s.data.player_id.toString()),
                    boneyardCount: game.boneyard.length,
                    lastTile: null,
                    lastSide: null,
                    lastPlayer: player_id,
                    yourTurn: isDrawingPlayer, // Drawing player is still the current player
                    turnTimerSeconds: timerSeconds,
                    handCount: Object.fromEntries([...game.hands].map(([id, h]) => [id, h.length]))
                }, [isDrawingPlayer ? 'You drew a tile.' : i18n.__('ws.games.opponentDrawn') || 'Opponent drew a tile.']));
            }

        } catch (err) {
            logger.error(`Error in Domino draw: ${err}`, { className: filename });
        }
    });
};
