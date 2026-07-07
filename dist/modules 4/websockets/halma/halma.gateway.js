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
var HalmaGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.HalmaGateway = void 0;
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
const halma_game_schema_1 = require("./schemas/halma-game.schema");
const halma_game_logic_1 = require("./halma-game.logic");
const i18n_service_1 = require("../../../common/i18n/i18n.service");
const game_prize_util_1 = require("../../../common/utils/game-prize.util");
const tournament_match_service_1 = require("../../tournament/services/tournament-match.service");
const turnTimers = new Map();
const clearTimer = (id) => { const t = turnTimers.get(id); if (t) {
    clearTimeout(t);
    turnTimers.delete(id);
} };
let HalmaGateway = HalmaGateway_1 = class HalmaGateway {
    halmaModel;
    roomModel;
    userModel;
    config;
    roomsGateway;
    redis;
    i18n;
    grace;
    tournamentMatchService;
    server;
    logger = new common_1.Logger(HalmaGateway_1.name);
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
    constructor(halmaModel, roomModel, userModel, config, roomsGateway, redis, i18n, grace, tournamentMatchService) {
        this.halmaModel = halmaModel;
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
        this.grace.registerHandler('halma', (playerId, roomId) => this.executeForfeit(roomId, playerId));
    }
    afterInit(server) { (0, ws_auth_middleware_1.applyWsAuth)(server, this.config, this.redis); }
    handleConnection(client) { this.logger.log(`[Halma] Connected: ${client.id}`); }
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
            client.to(room_id).emit('halma', { success: true, data: { spectatorsCount: updated?.spectators?.length || 0 }, messages: [] });
            return;
        }
        if (room.status === 'waiting') {
            const updated = await this.roomModel.findOneAndUpdate({ _id: roomObjId, 'players.playerId': playerObjId }, { $pull: { players: { playerId: playerObjId } } }, { returnDocument: 'after' });
            const gameIdForLobby = room.game_id?._id?.toString() || room.game_id?.toString();
            if (updated?.players.length === 0) {
                await this.roomModel.findOneAndDelete({ _id: roomObjId, players: { $size: 0 } });
                if (gameIdForLobby)
                    this.roomsGateway.broadcastRoomUpdate(gameIdForLobby, 'roomDeleted', { id: room_id });
            }
            else {
                client.to(room_id).emit('halma', { success: true, data: { opponentLeft: true }, messages: ['Opponent left.'] });
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
            const game = await this.halmaModel.findOne({ room_id: roomObjId });
            let remainingTurnSecs = 0;
            if (game?.turn_start_time) {
                const limit = (room.game_id?.turn_timer_seconds || 30) * 1000;
                remainingTurnSecs = Math.ceil((limit - (Date.now() - game.turn_start_time.getTime())) / 1000);
            }
            await this.grace.start('halma', player_id, room_id, Math.max(60, remainingTurnSecs));
        }
    }
    async executeForfeit(room_id, player_id) {
        const room = await this.roomModel.findOne({ _id: new mongoose_2.Types.ObjectId(room_id), status: 'started' });
        if (!room)
            return;
        if (room.players.length < 2)
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
            s.emit('halma', {
                success: false,
                data: { outcome: 'opponent_disconnected', gameEnded: true, winner: sIsSpectator ? winnerUsername : winner_id, isSpectator: sIsSpectator },
                messages: sIsSpectator ? [this.i18n.translate('ws.games.winsForfeit', sLang, { username: winnerUsername })] : [this.i18n.translate('ws.games.playerDisconnected', sLang)]
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
        await this.grace.cancel('halma', player_id);
        if (!room_id)
            return client.emit('halma', { success: false, messages: [this.i18n.translate('ws.invalidMessageFormat', lang)] });
        const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds');
        if (!room)
            return client.emit('halma', { success: false, messages: [this.i18n.translate('ws.games.gameNotFound', lang)] });
        if (room.status === 'finished')
            return client.emit('halma', { success: false, messages: [this.i18n.translate('ws.games.roomInactive', lang)] });
        const isMember = room.players.some((p) => p.playerId.toString() === player_id);
        const isSpectator = room.spectators?.some((id) => id.toString() === player_id);
        if (!isMember && !isSpectator)
            return client.emit('halma', { success: false, messages: [this.i18n.translate('ws.games.notInRoom', lang)] });
        await client.join(room_id);
        client.data.room_id = room_id;
        client.data.isSpectator = !isMember;
        if (client.data.isSpectator) {
            this.logger.log(`[Halma] 👀 Spectator joined | room=${room_id} | player=${player_id}`);
            const game = await this.halmaModel.findOne({ room_id });
            if (game) {
                const p1Id = room.players[0]?.playerId?.toString();
                const player1 = p1Id ? await this.getCachedUsername(p1Id) : 'Unknown';
                const p2Id = room.players[1]?.playerId?.toString();
                const player2 = p2Id ? await this.getCachedUsername(p2Id) : 'Unknown';
                const shotFrom = game.current_player === 1 ? player1 : player2;
                const now = new Date();
                const elapsed = Math.floor((now.getTime() - game.turn_start_time.getTime()) / 1000);
                const remaining = Math.max(0, 30 - elapsed);
                client.emit('halma', { success: true, messages: [], data: {
                        board: game.board,
                        pendingCaptures: game.pending_captures || [],
                        yourTurn: false, turnTimerSeconds: remaining,
                        waitingForOpponent: false, isPlayerOne: false, gameStarted: true, youWon: false,
                        isSpectator: true,
                        spectatorsCount: room.spectators.length,
                        player1, player2,
                        shotFrom,
                        turnOf: shotFrom,
                        history: room.players.flatMap((p, i) => p.moves.map(m => ({ ...m.data, player: i === 0 ? player1 : player2 })))
                    } });
                client.to(room_id).emit('halma', { success: true, data: { spectatorsCount: room.spectators.length }, messages: [] });
                return;
            }
            return client.emit('halma', { success: false, messages: [this.i18n.translate('ws.games.gameNotFound', lang)] });
        }
        const playerIndex = room.players.findIndex((p) => p.playerId.toString() === player_id);
        const playerNum = playerIndex + 1;
        client.data.playerNum = playerNum;
        if (room.status === 'started') {
            const game = await this.halmaModel.findOne({ room_id });
            if (game) {
                const isMyTurn = game.current_player === playerNum;
                const totalTimerSeconds = room.game_id?.turn_timer_seconds || 30;
                const elapsed = game.turn_start_time
                    ? Math.floor((Date.now() - game.turn_start_time.getTime()) / 1000)
                    : 0;
                const remaining = Math.max(5, totalTimerSeconds - elapsed);
                if (isMyTurn) {
                    this.startTimer(client, room_id, remaining);
                }
                return client.emit('halma', { success: true, messages: [], data: {
                        board: game.board,
                        yourTurn: isMyTurn, turnTimerSeconds: remaining,
                        waitingForOpponent: false, isPlayerOne: playerNum === 1, gameStarted: true, youWon: false, isSpectator: false
                    } });
            }
        }
        client.emit('halma', { success: true, data: { waitingForOpponent: true, isPlayerOne: playerNum === 1, isSpectator: false }, messages: [this.i18n.translate('ws.games.waitingOpponent', lang)] });
        const socketsInRoom = await this.server.in(room_id).fetchSockets();
        if (socketsInRoom.length > 1) {
            const user = await this.userModel.findById(player_id).select('username');
            const username = user?.username || 'Opponent';
            client.to(room_id).emit('halma', { success: true, data: { opponentJoined: true, opponentName: username }, messages: [this.i18n.translate('ws.games.opponentJoined', lang, { username })] });
        }
        const maxPlayers = room.player_limit || room.game_id?.max_players || 2;
        if (socketsInRoom.length >= maxPlayers && room.status === 'waiting') {
            if (room.players.length < maxPlayers || !room.players[0]?.playerId || !room.players[1]?.playerId) {
                return;
            }
            const started = await this.roomModel.findOneAndUpdate({ _id: room_id, status: 'waiting' }, { $set: { status: 'started' } }, { returnDocument: 'after' });
            if (!started)
                return;
            const [p1id, p2id] = [room.players[0].playerId, room.players[1].playerId];
            const paid = [];
            const compensate = async (errKey, reason) => {
                this.logger.error(`event=halma_start_failed room=${room_id} reason=${reason}`);
                for (const pid of paid) {
                    await this.userModel
                        .updateOne({ _id: pid }, { $inc: { balance: room.bet_amount } })
                        .catch((e) => this.logger.error(`[Halma] Refund failed | player=${pid}`, e));
                }
                await this.halmaModel
                    .deleteOne({ room_id: new mongoose_2.Types.ObjectId(room_id) })
                    .catch((e) => this.logger.error(`[Halma] Game cleanup failed | room=${room_id}`, e));
                await this.roomModel
                    .findByIdAndUpdate(room_id, { $set: { status: 'waiting' } })
                    .catch((e) => this.logger.error(`[Halma] Room status reset failed | room=${room_id}`, e));
                this.server
                    .to(room_id)
                    .emit('halma', { success: false, messages: [this.i18n.translate(errKey, lang)] });
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
            const board = (0, halma_game_logic_1.createHalmaBoard)();
            try {
                await this.halmaModel.create({ room_id, player1_id: p1id, player2_id: p2id, board, current_player: 1, turn_start_time: new Date() });
            }
            catch (e) {
                this.logger.error(`[Halma] Game create failed | room=${room_id}`, e);
                await compensate('ws.games.matchmakingError', 'game_create_failed');
                return;
            }
            for (const s of socketsInRoom) {
                const sIsSpectator = s.data.isSpectator || false;
                const pNum = s.data.playerNum || 1;
                const isTurn = pNum === 1;
                const sLang = this.getLang(s);
                s.emit('halma', {
                    success: true,
                    data: { board, yourTurn: isTurn && !sIsSpectator, isPlayerOne: pNum === 1, gameStarted: true, turnTimerSeconds: 30, isSpectator: sIsSpectator },
                    messages: sIsSpectator ? [this.i18n.translate('ws.games.gameStarted', sLang)] : [isTurn ? this.i18n.translate('ws.games.yourTurn', sLang) : this.i18n.translate('ws.games.waitingOpponent', sLang)]
                });
                if (isTurn)
                    this.startTimer(s, room_id, 30);
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
            return client.emit('halma', { success: false, messages: [this.i18n.translate('ws.games.spectatorActionDenied', lang)] });
        this.logger.log(`[Halma] ♟ Move received | room=${payload?.room_id} | player=${client.data.player_id}`);
        const room_id = payload.room_id || client.data.room_id;
        let { move } = payload;
        const player_id = client.data.player_id;
        if (!move && payload.from_row !== undefined && payload.from_col !== undefined) {
            move = {
                from: [Number(payload.from_row), Number(payload.from_col)],
                to: [Number(payload.to_row), Number(payload.to_col)]
            };
        }
        if (!room_id || !move) {
            this.logger.warn(`[Halma] ❌ Invalid move payload (missing room_id or move) | player=${player_id} | payload=${JSON.stringify(payload)} | socketRoom=${client.data.room_id}`);
            return client.emit('halma', { success: false, messages: [this.i18n.translate('ws.games.invalidMove', lang)] });
        }
        const game = await this.halmaModel.findOne({ room_id: new mongoose_2.Types.ObjectId(room_id) });
        if (!game)
            return client.emit('halma', { success: false, messages: [this.i18n.translate('ws.games.gameNotFound', lang)] });
        const playerNum = client.data.playerNum || 1;
        if (game.current_player !== playerNum)
            return client.emit('halma', { success: false, messages: [this.i18n.translate('ws.games.notYourTurn', lang)] });
        const { from, to } = move;
        if (!from || !to || !Array.isArray(from) || !Array.isArray(to)) {
            this.logger.warn(`[Halma] ❌ Invalid move coordinates | player=${player_id} | move=${JSON.stringify(move)}`);
            return client.emit('halma', { success: false, messages: [this.i18n.translate('ws.games.invalidMove', lang)] });
        }
        const board = game.board;
        const [fr, fc] = [from[0], from[1]];
        const [tr, tc] = [to[0], to[1]];
        const isStep = (0, halma_game_logic_1.isValidStep)(board, fr, fc, tr, tc, playerNum);
        const isJump = (0, halma_game_logic_1.isValidJump)(board, fr, fc, tr, tc);
        if (!isStep && !isJump) {
            this.logger.warn(`[Halma] ❌ Illegal move (isStep=${isStep}, isJump=${isJump}) | player=${player_id} | pNum=${playerNum} | from=[${fr},${fc}] | to=[${tr},${tc}]`);
            return client.emit('halma', { success: false, messages: [this.i18n.translate('ws.games.invalidMove', lang)], data: { board } });
        }
        board[tr][tc] = board[fr][fc];
        board[fr][fc] = 0;
        if (playerNum === 1 && tr === 7 && board[tr][tc] === halma_game_logic_1.P1_NORMAL) {
            board[tr][tc] = halma_game_logic_1.P1_KING;
        }
        else if (playerNum === 2 && tr === 0 && board[tr][tc] === halma_game_logic_1.P2_NORMAL) {
            board[tr][tc] = halma_game_logic_1.P2_KING;
        }
        const chainPossible = isJump && (0, halma_game_logic_1.canJumpFurther)(board, tr, tc);
        if (isJump) {
            const dr = tr - fr;
            const dc = tc - fc;
            const absDr = Math.abs(dr);
            const unitR = dr / absDr;
            const unitC = dc / absDr;
            let midR = -1;
            let midC = -1;
            for (let i = 1; i < absDr; i++) {
                const rr = fr + i * unitR;
                const cc = fc + i * unitC;
                if (board[rr][cc] !== 0) {
                    midR = rr;
                    midC = cc;
                    break;
                }
            }
            if (midR !== -1) {
                const jumpedPiece = board[midR][midC];
                const isOpponenPiece = (playerNum === 1 && (jumpedPiece === halma_game_logic_1.P2_NORMAL || jumpedPiece === halma_game_logic_1.P2_KING)) ||
                    (playerNum === 2 && (jumpedPiece === halma_game_logic_1.P1_NORMAL || jumpedPiece === halma_game_logic_1.P1_KING));
                if (isOpponenPiece) {
                    const idx = game.pending_captures.findIndex(([pr, pc]) => pr === midR && pc === midC);
                    if (idx !== -1)
                        game.pending_captures.splice(idx, 1);
                    else
                        game.pending_captures.push([midR, midC]);
                }
            }
        }
        game.board = board;
        game.markModified('board');
        await game.save();
        await this.roomModel.updateOne({ _id: new mongoose_2.Types.ObjectId(room_id), 'players.playerId': new mongoose_2.Types.ObjectId(client.data.player_id) }, { $push: { 'players.$.moves': { data: { from, to, type: 'move' } } } });
        const now = new Date();
        const elapsed = Math.floor((now.getTime() - game.turn_start_time.getTime()) / 1000);
        const remaining = Math.max(0, 30 - elapsed);
        const sockets = await this.server.in(room_id).fetchSockets();
        const pendingCaptures = game.pending_captures || [];
        if (chainPossible) {
            game.turn_start_time = new Date();
            await game.save();
            client.emit('halma', {
                success: true,
                data: { board, pendingCaptures, yourTurn: true, turnTimerSeconds: remaining, outcome: '', isPlayerOne: playerNum === 1, continuingJump: true, jumpingPiece: { row: tr, col: tc }, isSpectator: false },
                messages: [this.i18n.translate('ws.games.canJumpAgain', lang)]
            });
        }
        else {
            game.must_end_turn = true;
            await game.save();
            client.emit('halma', {
                success: true,
                data: { board, pendingCaptures, yourTurn: true, turnTimerSeconds: remaining, outcome: '', isPlayerOne: playerNum === 1, mustEndTurn: true, isSpectator: false },
                messages: [this.i18n.translate('ws.games.moveAcceptedEndTurn', lang)]
            });
        }
        const p1Name = await this.getCachedUsername(game.player1_id.toString());
        const p2Name = await this.getCachedUsername(game.player2_id.toString());
        for (const s of sockets) {
            if (s.id === client.id)
                continue;
            const sIsSpectator = s.data.isSpectator || false;
            const sLang = this.getLang(s);
            const sData = { board, pendingCaptures, yourTurn: false, turnTimerSeconds: remaining, outcome: '', isPlayerOne: s.data.playerNum === 1, isSpectator: sIsSpectator };
            if (sIsSpectator) {
                sData.player1 = p1Name;
                sData.player2 = p2Name;
                sData.shotFrom = playerNum === 1 ? p1Name : p2Name;
                sData.turnOf = playerNum === 1 ? p1Name : p2Name;
            }
            s.emit('halma', {
                success: true,
                data: sData,
                messages: sIsSpectator ? [this.i18n.translate(chainPossible ? 'ws.games.continuingJump' : 'ws.games.opponentMoved', sLang)] : [this.i18n.translate(chainPossible ? 'ws.games.opponentContinuingJump' : 'ws.games.opponentMoved', sLang)]
            });
        }
    }
    async handleEndTurn(client, payload) {
        const lang = this.getLang(client);
        const room_id = payload.room_id || client.data.room_id;
        if (!room_id)
            return client.emit('halma', { success: false, messages: [this.i18n.translate('ws.games.invalidMove', lang)] });
        const game = await this.halmaModel.findOne({ room_id: new mongoose_2.Types.ObjectId(room_id) });
        const playerNum = client.data.playerNum || 1;
        if (!game || game.current_player !== playerNum)
            return;
        if (game.pending_captures && game.pending_captures.length > 0) {
            const b = game.board;
            for (const [cr, cc] of game.pending_captures) {
                b[cr][cc] = 0;
            }
            game.board = b;
            game.pending_captures = [];
            game.markModified('board');
        }
        game.current_player = (playerNum === 1 ? 2 : 1);
        game.turn_start_time = new Date();
        game.must_end_turn = false;
        await game.save();
        await this.roomModel.updateOne({ _id: new mongoose_2.Types.ObjectId(room_id), 'players.playerId': new mongoose_2.Types.ObjectId(client.data.player_id) }, { $push: { 'players.$.moves': { data: { type: 'end_turn' } } } });
        const timerSec = 30;
        const sockets = await this.server.in(room_id).fetchSockets();
        const opponent = sockets.find(s => s.data.playerNum === game.current_player);
        clearTimer(client.id);
        if (opponent)
            this.startTimer(opponent, room_id, timerSec);
        const b = game.board;
        const p1All = b.flat().filter(p => p === 1 || p === 3);
        const p2All = b.flat().filter(p => p === 2 || p === 4);
        const p1Pieces = p1All.length;
        const p2Pieces = p2All.length;
        let automatedWinner = 0;
        let isDraw = false;
        let winReason = 'elimination';
        if (p1Pieces === 0)
            automatedWinner = 2;
        else if (p2Pieces === 0)
            automatedWinner = 1;
        else if (p1Pieces === 1 && p2Pieces === 1) {
            const p1IsKing = p1All[0] === 3;
            const p2IsKing = p2All[0] === 4;
            if (p1IsKing && p2IsKing)
                isDraw = true;
        }
        if (automatedWinner !== 0 || isDraw) {
            const room = await this.roomModel.findById(room_id);
            room.status = 'finished';
            room.finished_at = new Date();
            if (isDraw) {
                room.winner = null;
                room.winner_reason = 'draw';
                await room.save();
                await this.userModel.updateOne({ _id: game.player1_id }, { $inc: { balance: room.bet_amount } });
                await this.userModel.updateOne({ _id: game.player2_id }, { $inc: { balance: room.bet_amount } });
            }
            else {
                const winnerId = automatedWinner === 1 ? game.player1_id : game.player2_id;
                room.winner = winnerId;
                room.winner_reason = winReason;
                await room.save();
                await this.tournamentMatchService?.tryCompleteFromFinishedRoom(room, winnerId.toString(), winReason);
                const grossPayout = (0, game_prize_util_1.winnerGrossPayout)(room.bet_amount, room.house_edge, room.players.length);
                await this.userModel.updateOne({ _id: winnerId }, { $inc: { balance: grossPayout } });
            }
            const winnerUsername = !isDraw ? await this.getCachedUsername((automatedWinner === 1 ? game.player1_id : game.player2_id).toString()) : null;
            const displayPrize = (0, game_prize_util_1.winnerDisplayedPrize)(room.bet_amount, room.house_edge, room.players.length);
            for (const s of sockets) {
                const sIsSpectator = s.data.isSpectator || false;
                const isWinner = s.data.playerNum === (automatedWinner === 1 ? 1 : 2);
                const sLang = this.getLang(s);
                const sData = {
                    board: game.board, gameEnded: true, outcome: isDraw ? 'draw' : (isWinner ? 'win' : 'lose'), youWon: !isDraw && isWinner && !sIsSpectator,
                    winner: isDraw ? null : (sIsSpectator ? winnerUsername : (automatedWinner === 1 ? game.player1_id : game.player2_id)),
                    reason: isDraw ? 'draw' : winReason,
                    prize: isDraw ? 0 : (isWinner ? displayPrize : 0),
                    isSpectator: sIsSpectator
                };
                s.emit('halma', {
                    success: true,
                    data: sData,
                    messages: sIsSpectator ? (isDraw ? [this.i18n.translate('ws.games.drawKing', sLang)] : [this.i18n.translate('ws.games.wins', sLang, { username: winnerUsername })]) : (isDraw ? [this.i18n.translate('ws.games.drawKing', sLang)] : [isWinner ? this.i18n.translate('ws.games.win', sLang) : this.i18n.translate('ws.games.lose', sLang)])
                });
            }
            const gameId = room.game_id?._id?.toString() || room.game_id?.toString();
            if (gameId)
                this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
            return;
        }
        const p1NameUser = await this.getCachedUsername(game.player1_id.toString());
        const p2NameUser = await this.getCachedUsername(game.player2_id.toString());
        for (const s of sockets) {
            const sPNum = s.data.playerNum || 2;
            const sIsSpectator = s.data.isSpectator || false;
            const isMyTurn = sIsSpectator ? false : sPNum === game.current_player;
            const sLang = this.getLang(s);
            const msg = sIsSpectator ? [this.i18n.translate('ws.games.turnEnded', sLang)] : [(isMyTurn ? this.i18n.translate('ws.games.yourTurn', sLang) : this.i18n.translate('ws.games.opponentEndedTurn', sLang))];
            const sData = { board: game.board, yourTurn: isMyTurn, turnTimerSeconds: timerSec, outcome: '', isPlayerOne: sPNum === 1, isSpectator: sIsSpectator };
            if (sIsSpectator) {
                sData.player1 = p1NameUser;
                sData.player2 = p2NameUser;
                sData.turnOf = game.current_player === 1 ? p1NameUser : p2NameUser;
            }
            s.emit('halma', { success: true, data: sData, messages: msg });
        }
    }
    startTimer(socket, room_id, seconds) {
        clearTimer(socket.id);
        const t = setTimeout(async () => {
            const game = await this.halmaModel.findOne({ room_id: new mongoose_2.Types.ObjectId(room_id) });
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
                    s.emit('halma', {
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
exports.HalmaGateway = HalmaGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], HalmaGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('join'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], HalmaGateway.prototype, "handleJoin", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('move'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], HalmaGateway.prototype, "handleMove", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('end_turn'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], HalmaGateway.prototype, "handleEndTurn", null);
exports.HalmaGateway = HalmaGateway = HalmaGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({ namespace: '/halma', cors: { origin: '*', credentials: true } }),
    __param(0, (0, mongoose_1.InjectModel)(halma_game_schema_1.HalmaGame.name)),
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
], HalmaGateway);
//# sourceMappingURL=halma.gateway.js.map