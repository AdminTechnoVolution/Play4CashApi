const WsBaseResponse = require('../../../../shared/util/wsBaseResponse');
const i18n = require('../../../../shared/language/i18n');
const logger = require('../../../../shared/config/logger');
const path = require('path');
const filename = path.basename(__filename);
const Room = require('../../../models/room.model');
const User = require('../../../models/user.model');
const DominoGame = require('../../../models/dominoGame.model');
const { hasValidMoves, getGameResult } = require('./gameLogic');
const { startTurnTimer, clearTurnTimer } = require('./timerUtils');

const EVENT = 'domino';

module.exports = (socket, namespace) => {
    socket.on('pass', async () => {
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
                socket.emit(EVENT, WsBaseResponse.error({}, ['You must play if you have a valid move.']));
                return;
            }

            if (game.boneyard.length > 0) {
                socket.emit(EVENT, WsBaseResponse.error({}, ['You must draw from the boneyard if you have no moves.']));
                return;
            }

            // Increment consecutive passes
            game.consecutive_passes += 1;
            
            // Advance turn
            game.current_player_index = (game.current_player_index + 1) % game.player_ids.length;
            game.turn_start_time = new Date();
            
            // Check if blocked game
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
                    hands: Object.fromEntries(game.hands),
                    winner: result.winner,
                    reason: result.reason,
                    prize: result.winner ? prize : 0,
                    gameEnded: true
                }, [result.winner ? i18n.__('ws.games.win') : i18n.__('ws.games.draw')]));
                
                clearTurnTimer(socket);
                return;
            }

            // Record pass in Room players history
            await Room.updateOne(
                { _id: room_id, 'players.playerId': player_id },
                { $push: { 'players.$.moves': { data: { type: 'pass' } } } }
            );

            await game.save();

            // Notify everyone of the pass (Unified broadcast)
            const nextPlayerId = game.player_ids[game.current_player_index].toString();
            const socketsInRoom = await namespace.in(room_id).fetchSockets();
            const timerSeconds = room.game_id?.turn_timer_seconds ?? 30;

            for (const s of socketsInRoom) {
                const isNextTurn = s.data.player_id.toString() === nextPlayerId;
                s.emit(EVENT, WsBaseResponse.success({
                    board: game.board,
                    hand: game.hands.get(s.data.player_id.toString()),
                    lastTile: null,
                    lastSide: null,
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
            logger.error(`Error in Domino pass: ${err}`, { className: filename });
        }
    });
};
