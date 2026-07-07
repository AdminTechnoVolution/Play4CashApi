"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var ChessGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChessGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const grace_period_service_1 = require("../../../common/grace-period/grace-period.service");
const config_1 = require("@nestjs/config");
const socket_io_1 = require("socket.io");
const mongoose_2 = require("mongoose");
const ws_auth_middleware_1 = require("../../../common/guards/ws-auth.middleware");
const redis_module_1 = require("../../../common/redis/redis.module");
const rooms_gateway_1 = require("../rooms/rooms.gateway");
const chess_game_schema_1 = require("./schemas/chess-game.schema");
const i18n_service_1 = require("../../../common/i18n/i18n.service");
const game_prize_util_1 = require("../../../common/utils/game-prize.util");
const tournament_match_service_1 = require("../../tournament/services/tournament-match.service");
const chess_game_logic_1 = require("./chess-game.logic");
const turnTimers = new Map();
function clearTimer(socketId) {
    const t = turnTimers.get(socketId);
    if (t) {
        clearTimeout(t);
        turnTimers.delete(socketId);
    }
}
let ChessGateway = ChessGateway_1 = class ChessGateway {
    chessGameModel;
    roomModel;
    userModel;
    config;
    roomsGateway;
    redis;
    i18n;
    grace;
    tournamentMatchService;
    server;
    logger = new common_1.Logger(ChessGateway_1.name);
    usernameCache = new Map();
    async getCachedUsername(userId) {
        if (this.usernameCache.has(userId))
            return this.usernameCache.get(userId);
        const user = await this.userModel.findById(userId).select('username').lean();
        const username = user?.username || 'Unknown';
        if (user)
            this.usernameCache.set(userId, username);
        return username;
    }
    getLang(client) {
        return client.handshake?.query?.lang || client.data?.lang || 'en';
    }
    constructor(chessGameModel, roomModel, userModel, config, roomsGateway, redis, i18n, grace, tournamentMatchService) {
        this.chessGameModel = chessGameModel;
        this.roomModel = roomModel;
        this.userModel = userModel;
        this.config = config;
        this.roomsGateway = roomsGateway;
        this.redis = redis;
        this.i18n = i18n;
        this.grace = grace;
        this.tournamentMatchService = tournamentMatchService;
    }
    onModuleInit() {
        this.grace.registerHandler('chess', (playerId, roomId) => this.executeForfeit(roomId, playerId));
    }
    afterInit(server) { (0, ws_auth_middleware_1.applyWsAuth)(server, this.config, this.redis); }
    getCastlingAvailable(board, state, playerNum) {
        const playerState = { ...state, current_player: playerNum };
        return {
            kingSide: (0, chess_game_logic_1.isCastlingLegal)(board, playerState, 'K').legal,
            queenSide: (0, chess_game_logic_1.isCastlingLegal)(board, playerState, 'Q').legal,
        };
    }
    handleConnection(client) { this.logger.log(`[Chess] Connected: ${client.id}`); }
    async handleDisconnect(client) {
        clearTimer(client.id);
        const { room_id, player_id } = client.data;
        if (!room_id || !player_id)
            return;
        const roomObjId = new mongoose_2.Types.ObjectId(room_id);
        const playerObjId = new mongoose_2.Types.ObjectId(player_id);
        const room = await this.roomModel.findOne({ _id: roomObjId, $or: [{ 'players.playerId': playerObjId }, { spectators: playerObjId }] });
        if (!room || room.status === 'finished')
            return;
        const isSpectator = room.spectators?.some((id) => id.toString() === player_id);
        if (isSpectator) {
            const updated = await this.roomModel.findOneAndUpdate({ _id: room_id }, { $pull: { spectators: playerObjId } }, { returnDocument: 'after' });
            client.to(room_id).emit('chess', { success: true, data: { spectatorsCount: updated?.spectators?.length || 0 }, messages: [] });
            return;
        }
        if (room.status === 'waiting') {
            const updated = await this.roomModel.findOneAndUpdate({ _id: roomObjId, 'players.playerId': playerObjId }, { $pull: { players: { playerId: playerObjId } } }, { returnDocument: 'after' });
            if (!updated)
                return;
            const gameIdForLobby = room.game_id?._id?.toString() || room.game_id?.toString();
            if (updated.players.length === 0) {
                await this.roomModel.findOneAndDelete({ _id: room_id, players: { $size: 0 } });
                this.server.serverSideEmit?.('roomDeleted', { id: room_id });
                if (gameIdForLobby)
                    this.roomsGateway.broadcastRoomUpdate(gameIdForLobby, 'roomDeleted', { id: room_id });
            }
            else {
                const sLang = this.getLang(client);
                client.to(room_id).emit('chess', { success: true, messages: [this.i18n.translate('ws.games.opponentLeft', sLang)], data: { opponentLeft: true, waitingForOpponent: true } });
                if (gameIdForLobby) {
                    const populated = await this.roomModel
                        .findById(roomObjId)
                        .populate('game_id', '-created_at')
                        .populate('players.playerId', 'username')
                        .lean();
                    if (populated)
                        this.roomsGateway.broadcastRoomUpdate(gameIdForLobby, 'roomUpdated', populated);
                }
            }
            return;
        }
        if (room.status === 'started') {
            const game = await this.chessGameModel.findOne({ room_id: roomObjId });
            let remainingTurnSecs = 0;
            if (game) {
                const turnStart = game.turn_start_time?.getTime();
                const limit = (room.game_id?.turn_timer_seconds || 30) * 1000;
                if (turnStart)
                    remainingTurnSecs = Math.ceil((limit - (Date.now() - turnStart)) / 1000);
            }
            await this.grace.start('chess', player_id, room_id, Math.max(60, remainingTurnSecs));
        }
    }
    async executeForfeit(room_id, player_id) {
        const room = await this.roomModel.findOne({ _id: new mongoose_2.Types.ObjectId(room_id), status: 'started' });
        if (!room)
            return;
        const winner_id = room.players.find((p) => p.playerId.toString() !== player_id.toString())?.playerId;
        if (!winner_id)
            return;
        room.status = 'finished';
        room.winner = winner_id;
        room.winner_reason = 'forfeit';
        room.finished_at = new Date();
        await room.save();
        await this.tournamentMatchService?.tryCompleteFromFinishedRoom(room, winner_id.toString(), 'forfeit');
        const grossPayout = (0, game_prize_util_1.winnerGrossPayout)(room.bet_amount, room.house_edge, room.players.length);
        await this.userModel.findByIdAndUpdate(winner_id, { $inc: { balance: grossPayout } });
        const winnerUsername = await this.getCachedUsername(winner_id.toString());
        const sockets = await this.server.in(room_id).fetchSockets();
        for (const s of sockets) {
            const sIsSpectator = s.data.isSpectator || false;
            const sLang = this.getLang(s);
            s.emit('chess', {
                success: false,
                messages: sIsSpectator ? [this.i18n.translate('ws.games.winsForfeit', sLang, { username: winnerUsername })] : [this.i18n.translate('ws.games.playerDisconnected', sLang)],
                data: { outcome: 'opponent_disconnected', gameEnded: true, winner: sIsSpectator ? winnerUsername : winner_id, isSpectator: sIsSpectator }
            });
        }
        const gameId = room.game_id?._id?.toString() || room.game_id?.toString();
        if (gameId)
            this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
    }
    async handleJoin(client, payload) {
        const lang = this.getLang(client);
        const player_id = client.data.player_id;
        const room_id = payload?.room_id;
        await this.grace.cancel('chess', player_id);
        if (!room_id)
            return client.emit('chess', { success: false, messages: [this.i18n.translate('ws.invalidMessageFormat', lang)] });
        const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds');
        if (!room)
            return client.emit('chess', { success: false, messages: [this.i18n.translate('ws.games.gameNotFound', lang)] });
        if (room.status === 'finished')
            return client.emit('chess', { success: false, messages: [this.i18n.translate('ws.games.roomInactive', lang)] });
        const isMember = room.players.some((p) => p.playerId.toString() === player_id);
        const isSpectator = room.spectators?.some((id) => id.toString() === player_id);
        if (!isMember && !isSpectator)
            return client.emit('chess', { success: false, messages: [this.i18n.translate('ws.games.notInRoom', lang)] });
        await client.join(room_id);
        client.data.room_id = room_id;
        client.data.isSpectator = !isMember;
        if (client.data.isSpectator) {
            this.logger.log(`[Chess] 👀 Spectator joined | room=${room_id} | player=${player_id}`);
            const game = await this.chessGameModel.findOne({ room_id });
            if (game) {
                const p1Id = room.players[0]?.playerId?.toString();
                const p2Id = room.players[1]?.playerId?.toString();
                const player1 = p1Id ? await this.getCachedUsername(p1Id) : 'Unknown';
                const player2 = p2Id ? await this.getCachedUsername(p2Id) : 'Unknown';
                const shotFrom = game.current_player === 1 ? player1 : player2;
                client.emit('chess', { success: true, messages: [], data: {
                        board: game.board,
                        yourTurn: false, turnTimerSeconds: 30,
                        waitingForOpponent: false,
                        isPlayerOne: false, playingWhite: false,
                        gameStarted: true, youWon: false,
                        isSpectator: true,
                        spectatorsCount: room.spectators.length,
                        castlingAvailable: { kingSide: false, queenSide: false },
                        player1, player2, shotFrom, turnOf: shotFrom,
                        history: (game.history || []).map((m) => ({
                            ...m,
                            player: m.player === 1 ? player1 : (m.player === 2 ? player2 : m.player)
                        }))
                    } });
                client.to(room_id).emit('chess', { success: true, data: { spectatorsCount: room.spectators.length }, messages: [] });
                return;
            }
            else {
                return client.emit('chess', { success: false, messages: [this.i18n.translate('ws.games.gameNotFound', lang)] });
            }
        }
        const playerIndex = room.players.findIndex((p) => p.playerId.toString() === player_id);
        const playerNum = playerIndex === 0 ? 1 : 2;
        client.data.playerNum = playerNum;
        if (room.status === 'started') {
            const game = await this.chessGameModel.findOne({ room_id });
            if (game) {
                const totalTimerSeconds = room.game_id?.turn_timer_seconds || 30;
                let timerSeconds = totalTimerSeconds;
                if (room.turn_start_time) {
                    const elapsed = (Date.now() - new Date(room.turn_start_time).getTime()) / 1000;
                    timerSeconds = Math.max(5, Math.ceil(totalTimerSeconds - elapsed));
                }
                const isMyTurn = game.current_player === playerNum;
                const currentBoard = game.board;
                const currentState = game.toObject();
                if (isMyTurn) {
                    this.startTimer(client, room_id, timerSeconds);
                }
                return client.emit('chess', { success: true, messages: [], data: {
                        board: currentBoard,
                        yourTurn: isMyTurn, turnTimerSeconds: timerSeconds,
                        waitingForOpponent: false, isPlayerOne: playerNum === 1, playingWhite: playerNum === 1, gameStarted: true, youWon: false, isSpectator: false,
                        castlingAvailable: this.getCastlingAvailable(currentBoard, currentState, playerNum),
                    } });
            }
        }
        client.emit('chess', { success: true, messages: [this.i18n.translate('ws.games.waitingOpponent', lang)], data: { room_id, waitingForOpponent: true, isPlayerOne: playerNum === 1, isSpectator: false } });
        const socketsInRoom = await this.server.in(room_id).fetchSockets();
        if (socketsInRoom.length > 1) {
            const user = await this.userModel.findById(player_id).select('username');
            const username = user?.username || 'Opponent';
            client.to(room_id).emit('chess', { success: true, messages: [this.i18n.translate('ws.games.opponentJoined', lang, { username })], data: { opponentJoined: true, opponentName: username } });
        }
        if (socketsInRoom.length >= 2 && room.status === 'waiting') {
            if (room.players.length < 2 || !room.players[0]?.playerId || !room.players[1]?.playerId) {
                return;
            }
            const started = await this.roomModel.findOneAndUpdate({ _id: room_id, status: 'waiting' }, { $set: { status: 'started' } }, { returnDocument: 'after' });
            if (!started)
                return;
            const [p1id, p2id] = [room.players[0].playerId, room.players[1].playerId];
            const paid = [];
            const compensate = async (errKey, reason) => {
                this.logger.error(`event=chess_start_failed room=${room_id} reason=${reason}`);
                for (const pid of paid) {
                    await this.userModel
                        .updateOne({ _id: pid }, { $inc: { balance: room.bet_amount } })
                        .catch((e) => this.logger.error(`[Chess] Refund failed | player=${pid}`, e));
                }
                await this.chessGameModel
                    .deleteOne({ room_id: new mongoose_2.Types.ObjectId(room_id) })
                    .catch((e) => this.logger.error(`[Chess] Game cleanup failed | room=${room_id}`, e));
                await this.roomModel
                    .findByIdAndUpdate(room_id, { $set: { status: 'waiting' } })
                    .catch((e) => this.logger.error(`[Chess] Room status reset failed | room=${room_id}`, e));
                this.server
                    .to(room_id)
                    .emit('chess', { success: false, messages: [this.i18n.translate(errKey, lang)] });
            };
            const deduct1 = await this.userModel.findOneAndUpdate({ _id: p1id, balance: { $gte: room.bet_amount } }, { $inc: { balance: -room.bet_amount } }, { returnDocument: 'after' });
            if (!deduct1) {
                await compensate('ws.games.insufficientBalance', 'p1_insufficient');
                return;
            }
            paid.push(p1id);
            const deduct2 = await this.userModel.findOneAndUpdate({ _id: p2id, balance: { $gte: room.bet_amount } }, { $inc: { balance: -room.bet_amount } }, { returnDocument: 'after' });
            if (!deduct2) {
                await compensate('ws.games.insufficientBalance', 'p2_insufficient');
                return;
            }
            paid.push(p2id);
            const board = (0, chess_game_logic_1.createInitialBoard)();
            try {
                await this.chessGameModel.create({
                    room_id,
                    player1_id: p1id,
                    player2_id: p2id,
                    board,
                    current_player: 1,
                    castling_rights: { wK: true, wQ: true, bK: true, bQ: true },
                    en_passant_target: null,
                    turn_start_time: new Date(),
                });
            }
            catch (e) {
                this.logger.error(`[Chess] Game create failed | room=${room_id}`, e);
                await compensate('ws.games.matchmakingError', 'game_create_failed');
                return;
            }
            const timerSeconds = room.game_id?.turn_timer_seconds ?? 30;
            const initialState = { current_player: 1, castling_rights: { wK: true, wQ: true, bK: true, bQ: true }, en_passant_target: null };
            for (const s of socketsInRoom) {
                const sPNum = s.data.playerNum;
                const sIsSpectator = s.data.isSpectator || false;
                const isFirst = sPNum === 1;
                const sLang = this.getLang(s);
                s.emit('chess', { success: true, data: { board, yourTurn: isFirst && !sIsSpectator, turnTimerSeconds: timerSeconds, waitingForOpponent: false, isPlayerOne: isFirst, playingWhite: isFirst, gameStarted: true, youWon: false, isSpectator: sIsSpectator,
                        castlingAvailable: this.getCastlingAvailable(board, initialState, sPNum) },
                    messages: sIsSpectator ? [this.i18n.translate('ws.games.gameStarted', sLang)] : [isFirst ? this.i18n.translate('ws.games.yourTurn', sLang) : this.i18n.translate('ws.games.waitingOpponent', sLang)] });
                if (isFirst)
                    this.startTimer(s, room_id, timerSeconds);
            }
            const gId = room.game_id?._id?.toString() || room.game_id?.toString();
            const populated = await this.roomModel.findById(room_id).populate('game_id', '-created_at').populate('players.playerId', 'username').lean();
            if (gId)
                this.roomsGateway.broadcastRoomUpdate(gId, 'roomUpdated', populated);
        }
    }
    async handleMove(client, payload) {
        const lang = this.getLang(client);
        if (client.data.isSpectator)
            return client.emit('chess', { success: false, messages: [this.i18n.translate('ws.games.spectatorActionDenied', lang)] });
        const room_id = payload.room_id || client.data.room_id;
        this.logger.log(`[Chess] ♟ Move received | room=${room_id} | player=${client.data.player_id} | payload=${JSON.stringify(payload)}`);
        const { promotion } = payload;
        let { from, to } = payload;
        if (!from && payload.from_row !== undefined && payload.from_col !== undefined) {
            from = { row: Number(payload.from_row), col: Number(payload.from_col) };
        }
        if (!to && payload.to_row !== undefined && payload.to_col !== undefined) {
            to = { row: Number(payload.to_row), col: Number(payload.to_col) };
        }
        const playerNum = client.data.playerNum || 1;
        if (!room_id || !from || !to) {
            this.logger.warn(`[Chess] ❌ Invalid move payload (missing fields) | player=${client.data.player_id} | room_id=${room_id} | payload=${JSON.stringify(payload)} | socketRoom=${client.data.room_id}`);
            return client.emit('chess', { success: false, messages: [this.i18n.translate('ws.games.invalidMove', lang)] });
        }
        const game = await this.chessGameModel.findOne({ room_id: new mongoose_2.Types.ObjectId(room_id) });
        if (!game)
            return client.emit('chess', { success: false, messages: [this.i18n.translate('ws.games.gameNotFound', lang)] });
        if (game.current_player !== playerNum)
            return client.emit('chess', { success: false, messages: [this.i18n.translate('ws.games.notYourTurn', lang)] });
        const playerColor = playerNum === 1 ? chess_game_logic_1.COLORS.WHITE : chess_game_logic_1.COLORS.BLACK;
        const legalMoves = (0, chess_game_logic_1.getLegalMoves)(from.row, from.col, game.board, game.toObject());
        const move = legalMoves.find((m) => m.to.row === to.row && m.to.col === to.col);
        if (!move) {
            const inCheck = (0, chess_game_logic_1.isCheck)(playerColor, game.board, game.toObject());
            this.logger.warn(`[Chess] ❌ Illegal move | player=${client.data.player_id} | from=[${from.row},${from.col}] | to=[${to.row},${to.col}] | inCheck=${inCheck}`);
            return client.emit('chess', {
                success: false,
                messages: [this.i18n.translate(inCheck ? 'ws.chess.illegalMoveInCheck' : 'ws.chess.illegalMove', lang)],
                data: { board: game.board, yourTurn: true, inCheck },
            });
        }
        if (promotion)
            move.promotion = promotion;
        const { nextBoard, nextState } = (0, chess_game_logic_1.applyMove)(move, game.board, game.toObject());
        const result = (0, chess_game_logic_1.getGameResult)(nextBoard, nextState);
        game.board = nextBoard;
        game.current_player = nextState.current_player;
        game.castling_rights = nextState.castling_rights;
        game.en_passant_target = nextState.en_passant_target;
        const movingPlayerUsername = await this.getCachedUsername(client.data.player_id);
        game.history.push({ player: movingPlayerUsername, from, to, moveType: move.castle ? 'castle' : move.enPassant ? 'enPassant' : 'normal' });
        game.turn_start_time = new Date();
        game.markModified('board');
        await game.save();
        const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds');
        if (!room)
            return client.emit('chess', { success: false, messages: [this.i18n.translate('ws.games.gameNotFound', lang)] });
        const limit = room.game_id?.turn_timer_seconds || 30;
        const sockets = await this.server.in(room_id).fetchSockets();
        const opponent = sockets.find(s => s.data.playerNum === game.current_player);
        clearTimer(client.id);
        if (opponent)
            this.startTimer(opponent, room_id, limit);
        room.turn_start_time = new Date();
        await room.save();
        if (room.status === 'finished') {
            return client.emit('chess', { success: false, messages: [this.i18n.translate('ws.games.roomInactive', lang)] });
        }
        if (result.finished) {
            room.status = 'finished';
            room.winner_reason = result.reason;
            room.finished_at = new Date();
            if (result.winner) {
                const winnerId = result.winner === 1 ? game.player1_id : game.player2_id;
                room.winner = winnerId;
                const grossPayout = (0, game_prize_util_1.winnerGrossPayout)(room.bet_amount, room.house_edge, room.players.length);
                await this.userModel.updateOne({ _id: winnerId }, { $inc: { balance: grossPayout } });
            }
            await room.save();
            if (result.winner) {
                const winnerId = result.winner === 1 ? game.player1_id : game.player2_id;
                await this.tournamentMatchService?.tryCompleteFromFinishedRoom(room, winnerId.toString(), result.reason || 'normal');
            }
            clearTimer(client.id);
            const gameId = room.game_id?._id?.toString() || room.game_id?.toString();
            if (gameId)
                this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
        }
        const p1Id = room.players[0]?.playerId?.toString();
        const p2Id = room.players[1]?.playerId?.toString();
        const player1Name = p1Id ? await this.getCachedUsername(p1Id) : 'Unknown';
        const player2Name = p2Id ? await this.getCachedUsername(p2Id) : 'Unknown';
        const shotFrom = movingPlayerUsername;
        const displayPrize = (0, game_prize_util_1.winnerDisplayedPrize)(room.bet_amount, room.house_edge, room.players.length);
        const inCheckNow = (0, chess_game_logic_1.isCheck)(game.current_player === 1 ? chess_game_logic_1.COLORS.WHITE : chess_game_logic_1.COLORS.BLACK, nextBoard, nextState);
        const myCastling = this.getCastlingAvailable(nextBoard, nextState, playerNum);
        for (const s of sockets) {
            const sLang = this.getLang(s);
            const sPNum = s.data.playerNum || 0;
            const sIsSpectator = s.data.isSpectator || false;
            const isWinner = result.winner === sPNum;
            const isDraw = result.finished && !result.winner;
            const sData = {
                board: nextBoard, lastMove: { from, to }, yourTurn: !sIsSpectator && sPNum === game.current_player && !result.finished,
                turnTimerSeconds: limit, turn_start_time: room.turn_start_time, inCheck: inCheckNow,
                outcome: result.finished ? (result.winner ? (isWinner ? 'win' : 'lose') : 'draw') : '',
                youWon: !isDraw && isWinner && !sIsSpectator,
                gameEnded: result.finished,
                winner: result.winner === 1 ? game.player1_id : (result.winner === 2 ? game.player2_id : null),
                reason: result.reason, isPlayerOne: sPNum === 1, playingWhite: sPNum === 1,
                prize: (result.finished && isWinner) ? displayPrize : 0,
                castlingAvailable: sIsSpectator ? { white: { short: true, long: true }, black: { short: true, long: true } } : this.getCastlingAvailable(nextBoard, nextState, sPNum),
                isSpectator: sIsSpectator
            };
            if (sIsSpectator) {
                sData.player1 = player1Name;
                sData.player2 = player2Name;
                sData.shotFrom = shotFrom;
                sData.turnOf = game.current_player === 1 ? player1Name : player2Name;
                sData.winner = result.winner === 1 ? player1Name : (result.winner === 2 ? player2Name : null);
            }
            let msg = '';
            if (result.finished) {
                msg = isDraw ? this.i18n.translate('ws.games.drawGeneric', sLang) : (isWinner ? this.i18n.translate('ws.games.win', sLang) : this.i18n.translate('ws.games.lose', sLang));
                if (sIsSpectator && result.winner)
                    msg = this.i18n.translate('ws.games.wins', sLang, { username: sData.winner });
            }
            else {
                msg = inCheckNow ? this.i18n.translate('ws.chess.check', sLang) : (s.id === client.id ? this.i18n.translate('ws.games.moveAccepted', sLang) : this.i18n.translate('ws.games.opponentMoved', sLang));
            }
            s.emit('chess', { success: true, data: sData, messages: [msg] });
        }
    }
    async handleEndTurn(client, payload) {
        const lang = this.getLang(client);
        return client.emit('chess', { success: false, messages: [this.i18n.translate('ws.games.chessAutoTurn', lang)] });
    }
    startTimer(socket, room_id, seconds) {
        clearTimer(socket.id);
        const t = setTimeout(async () => {
            const game = await this.chessGameModel.findOne({ room_id: new mongoose_2.Types.ObjectId(room_id) });
            if (!game)
                return;
            const winnerNum = game.current_player === 1 ? 2 : 1;
            const winnerId = winnerNum === 1 ? game.player1_id : game.player2_id;
            const room = await this.roomModel.findById(room_id);
            if (room && room.status === 'started') {
                room.status = 'finished';
                room.winner = winnerId;
                room.winner_reason = 'timeout';
                room.finished_at = new Date();
                await room.save();
                await this.tournamentMatchService?.tryCompleteFromFinishedRoom(room, winnerId.toString(), 'timeout');
                const grossPayout = (0, game_prize_util_1.winnerGrossPayout)(room.bet_amount, room.house_edge, room.players.length);
                const displayPrize = (0, game_prize_util_1.winnerDisplayedPrize)(room.bet_amount, room.house_edge, room.players.length);
                await this.userModel.updateOne({ _id: winnerId }, { $inc: { balance: grossPayout } });
                const sockets = await this.server.in(room_id).fetchSockets();
                const winnerUsername = await this.getCachedUsername(winnerId.toString());
                for (const s of sockets) {
                    const sIsSpectator = s.data.isSpectator || false;
                    const isWinnerFound = s.data.playerNum === winnerNum;
                    const sLang = this.getLang(s);
                    s.emit('chess', {
                        success: true,
                        data: {
                            gameEnded: true, outcome: isWinnerFound ? 'win' : 'timeout_loss', youWon: isWinnerFound && !sIsSpectator,
                            winner: sIsSpectator ? winnerUsername : winnerId, reason: 'timeout', prize: isWinnerFound ? displayPrize : 0, isSpectator: sIsSpectator
                        },
                        messages: sIsSpectator ? [this.i18n.translate('ws.games.winsTimeout', sLang, { username: winnerUsername })] : [isWinnerFound ? this.i18n.translate('ws.games.timeoutWin', sLang) : this.i18n.translate('ws.games.timeoutLoss', sLang)]
                    });
                }
                const gameId = room.game_id?._id?.toString() || room.game_id?.toString();
                if (gameId)
                    this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
            }
        }, seconds * 1000);
        turnTimers.set(socket.id, t);
    }
};
exports.ChessGateway = ChessGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], ChessGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('join'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], ChessGateway.prototype, "handleJoin", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('move'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], ChessGateway.prototype, "handleMove", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('end_turn'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], ChessGateway.prototype, "handleEndTurn", null);
exports.ChessGateway = ChessGateway = ChessGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({ namespace: '/chess', cors: { origin: '*', credentials: true } }),
    __param(0, (0, mongoose_1.InjectModel)(chess_game_schema_1.ChessGame.name)),
    __param(1, (0, mongoose_1.InjectModel)('Room')),
    __param(2, (0, mongoose_1.InjectModel)('User')),
    __param(5, (0, common_1.Inject)(redis_module_1.REDIS_CLIENT)),
    __param(8, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        config_1.ConfigService,
        rooms_gateway_1.RoomsGateway, Object, i18n_service_1.I18nService,
        grace_period_service_1.GracePeriodService,
        tournament_match_service_1.TournamentMatchService])
], ChessGateway);
//# sourceMappingURL=chess.gateway.js.map