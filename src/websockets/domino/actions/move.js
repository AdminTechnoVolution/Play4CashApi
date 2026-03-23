const WsBaseResponse = require('../../../../shared/util/wsBaseResponse');
const i18n = require('../../../../shared/language/i18n');
const logger = require('../../../../shared/config/logger');
const path = require('path');
const filename = path.basename(__filename);
const Joi = require('joi');
const Room = require('../../../models/room.model');
const User = require('../../../models/user.model');
const DominoGame = require('../../../models/dominoGame.model');
const { validateMove, getGameResult } = require('./gameLogic');
const { startTurnTimer, clearTurnTimer } = require('./timerUtils');

const EVENT = 'domino';

const moveSchema = Joi.object({
    tile: Joi.array().items(Joi.number()).length(2).required(),
    side: Joi.string().valid('left', 'right').required()
});

module.exports = (socket, namespace) => {
    socket.on('move', async (payload) => {
        try {
            const { error } = moveSchema.validate(payload);
            if (error) {
                socket.emit(EVENT, WsBaseResponse.error({}, [error.details[0].message]));
                return;
            }

            const { tile, side } = payload;
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
            const tileIndex = hand.findIndex(t => (t[0] === tile[0] && t[1] === tile[1]) || (t[0] === tile[1] && t[1] === tile[0]));
            
            if (tileIndex === -1) {
                socket.emit(EVENT, WsBaseResponse.error({}, ['Tile not in hand']));
                return;
            }

            const { valid, flippedTile } = validateMove(tile, side, game.open_ends);
            if (!valid) {
                socket.emit(EVENT, WsBaseResponse.error({}, ['Invalid move: tile does not match board ends']));
                return;
            }

            // Apply move
            if (side === 'left') {
                game.board.unshift(flippedTile);
                game.open_ends.left = flippedTile[0];
                if (game.open_ends.right === undefined) game.open_ends.right = flippedTile[1];
            } else {
                game.board.push(flippedTile);
                game.open_ends.right = flippedTile[1];
                if (game.open_ends.left === undefined) game.open_ends.left = flippedTile[0];
            }

            // Remove tile from hand
            hand.splice(tileIndex, 1);
            game.hands.set(player_id, hand);
            
            // Reset consecutive passes
            game.consecutive_passes = 0;
            
            // Record move in Room players history
            await Room.updateOne(
                { _id: room_id, 'players.playerId': player_id },
                { $push: { 'players.$.moves': { data: { tile, side, type: 'move' } } } }
            );
            
            // Check result
            const result = getGameResult(game, game.player_ids);
            const room = await Room.findById(room_id).populate('game_id', 'turn_timer_seconds');

            if (result.finished) {
                game.status = 'finished';
                await game.save();

                room.status = 'finished';
                room.winner = result.winner;
                room.winner_reason = result.reason;
                room.finished_at = new Date();
                await room.save();

                const prize = room.bet_amount * room.players.length * (1 - room.house_edge / 100);
                if (result.winner) {
                    await User.findByIdAndUpdate(result.winner, { $inc: { balance: prize } });
                }

                namespace.in(room_id).emit(EVENT, WsBaseResponse.success({
                    board: game.board,
                    hands: Object.fromEntries(game.hands), // Reveal hands at the end
                    winner: result.winner ? result.winner.toString() : null,
                    reason: result.reason,
                    prize: result.winner ? prize : 0,
                    gameEnded: true
                }, [result.winner ? i18n.__('ws.games.win') : i18n.__('ws.games.draw')]));
                
                clearTurnTimer(socket);
                return;
            }

            // Advance turn
            game.current_player_index = (game.current_player_index + 1) % game.player_ids.length;
            game.turn_start_time = new Date();
            await game.save();

            const nextPlayerId = game.player_ids[game.current_player_index].toString();
            const socketsInRoom = await namespace.in(room_id).fetchSockets();
            const timerSeconds = room.game_id?.turn_timer_seconds ?? 30;

            for (const s of socketsInRoom) {
                const isNextTurn = s.data.player_id.toString() === nextPlayerId;
                s.emit(EVENT, WsBaseResponse.success({
                    board: game.board,
                    hand: game.hands.get(s.data.player_id.toString()),
                    lastTile: flippedTile,
                    lastSide: side,
                    lastPlayer: player_id,
                    yourTurn: isNextTurn,
                    turnTimerSeconds: timerSeconds,
                    handCount: Object.fromEntries([...game.hands].map(([id, h]) => [id, h.length]))
                }, [isNextTurn ? i18n.__('ws.games.opponentReady') : i18n.__('ws.games.opponentMoved')]));

                if (isNextTurn) {
                    startTurnTimer(s, socketsInRoom, namespace, room_id, timerSeconds);
                } else {
                    clearTurnTimer(s);
                }
            }

        } catch (err) {
            logger.error(`Error in Domino move: ${err}`, { className: filename });
        }
    });
};
