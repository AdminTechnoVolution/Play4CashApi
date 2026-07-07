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
var DominoGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DominoGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const grace_period_service_1 = require("../../../common/grace-period/grace-period.service");
const turn_deadline_service_1 = require("../../../common/turn-deadline/turn-deadline.service");
const config_1 = require("@nestjs/config");
const socket_io_1 = require("socket.io");
const mongoose_2 = require("mongoose");
const ws_auth_middleware_1 = require("../../../common/guards/ws-auth.middleware");
const redis_module_1 = require("../../../common/redis/redis.module");
const rooms_gateway_1 = require("../rooms/rooms.gateway");
const domino_game_schema_1 = require("./schemas/domino-game.schema");
const domino_game_logic_1 = require("./domino-game.logic");
const i18n_service_1 = require("../../../common/i18n/i18n.service");
const game_prize_util_1 = require("../../../common/utils/game-prize.util");
const turnTimers = new Map();
const clearTimer = (id) => { const t = turnTimers.get(id); if (t) {
    clearTimeout(t);
    turnTimers.delete(id);
} };
let DominoGateway = DominoGateway_1 = class DominoGateway {
    dominoModel;
    roomModel;
    userModel;
    config;
    roomsGateway;
    redis;
    i18n;
    grace;
    turnDeadlines;
    server;
    logger = new common_1.Logger(DominoGateway_1.name);
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
    constructor(dominoModel, roomModel, userModel, config, roomsGateway, redis, i18n, grace, turnDeadlines) {
        this.dominoModel = dominoModel;
        this.roomModel = roomModel;
        this.userModel = userModel;
        this.config = config;
        this.roomsGateway = roomsGateway;
        this.redis = redis;
        this.i18n = i18n;
        this.grace = grace;
        this.turnDeadlines = turnDeadlines;
    }
    onModuleInit() {
        this.grace.registerHandler('domino', (playerId, roomId) => this.eliminatePlayer(roomId, playerId, 'forfeit'));
        this.turnDeadlines.registerHandler('domino', (playerId, roomId) => this.eliminatePlayer(roomId, playerId, 'timeout'));
    }
    async runWithRetry(fn, maxRetries = 3) {
        let lastError;
        for (let i = 0; i < maxRetries; i++) {
            try {
                return await fn();
            }
            catch (error) {
                if (error.name === 'VersionError' || error.message?.includes('version')) {
                    this.logger.warn(`[Domino] 🔄 Version collision detected, retrying... (${i + 1}/${maxRetries})`);
                    lastError = error;
                    await new Promise(resolve => setTimeout(resolve, 50 * (i + 1)));
                    continue;
                }
                throw error;
            }
        }
        this.logger.error(`[Domino] ❌ Max retries reached for game action`);
        throw lastError;
    }
    afterInit(server) { (0, ws_auth_middleware_1.applyWsAuth)(server, this.config, this.redis); }
    handleConnection(client) { this.logger.log(`[Domino] Connected: ${client.id}`); }
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
            const updated = await this.roomModel.findOneAndUpdate({ _id: roomObjId }, { $pull: { spectators: playerObjId } }, { returnDocument: 'after' });
            client.to(room_id).emit('domino', { success: true, data: { spectatorsCount: updated?.spectators?.length || 0 }, messages: [] });
            return;
        }
        if (room.status === 'waiting') {
            const updated = await this.roomModel.findOneAndUpdate({ _id: roomObjId, 'players.playerId': playerObjId }, { $pull: { players: { playerId: playerObjId } } }, { returnDocument: 'after' });
            if (!updated)
                return;
            const gameIdForLobby = room.game_id?._id?.toString() || room.game_id?.toString();
            if (updated.players.length === 0) {
                await this.roomModel.findOneAndDelete({ _id: roomObjId, players: { $size: 0 } });
                if (gameIdForLobby)
                    this.roomsGateway.broadcastRoomUpdate(gameIdForLobby, 'roomDeleted', { id: room_id });
            }
            else {
                const username = await this.getCachedUsername(player_id);
                const maxPlayers = room.player_limit || room.game_id?.max_players || 2;
                const lang = this.getLang(client);
                client.to(room_id).emit('domino', {
                    success: true,
                    data: {
                        opponentLeft: true,
                        waitingForOpponent: true,
                        playerLeft: username,
                        playersRemaining: updated.players.length,
                        playersRequired: maxPlayers,
                    },
                    messages: [this.i18n.translate('ws.domino.playerLeftWaiting', lang, { username })],
                });
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
            const reason = client.data.eliminationReason || 'forfeit';
            if (reason === 'timeout') {
                await this.eliminatePlayer(room_id, player_id, reason);
                return;
            }
            const game = await this.dominoModel.findOne({ room_id: roomObjId });
            let remainingTurnSecs = 0;
            if (game) {
                const currentPlayerId = game.player_ids[game.current_player_index]?.toString();
                if (currentPlayerId === player_id && game.turn_start_time) {
                    const limit = (room.game_id?.turn_timer_seconds || 30) * 1000;
                    remainingTurnSecs = Math.ceil((limit - (Date.now() - game.turn_start_time.getTime())) / 1000);
                }
            }
            await this.grace.start('domino', player_id, room_id, Math.max(60, remainingTurnSecs));
        }
    }
    async handleJoin(client, payload) {
        const lang = this.getLang(client);
        const player_id = client.data.player_id;
        const room_id = payload?.room_id;
        await this.grace.cancel('domino', player_id);
        if (!room_id)
            return client.emit('domino', { success: false, messages: [this.i18n.translate('ws.invalidMessageFormat', lang)] });
        const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds max_players');
        if (!room)
            return client.emit('domino', { success: false, messages: [this.i18n.translate('ws.games.gameNotFound', lang)] });
        if (room.status === 'finished')
            return client.emit('domino', { success: false, messages: [this.i18n.translate('ws.games.roomInactive', lang)] });
        await client.join(room_id);
        client.data.room_id = room_id;
        const game = await this.dominoModel.findOne({ room_id });
        const isMember = room.players.some((p) => p.playerId.toString() === player_id);
        const isEliminated = game?.eliminated_players?.includes(player_id);
        client.data.isSpectator = !isMember || isEliminated;
        if (client.data.isSpectator) {
            this.logger.log(`[Domino] 👀 User joined as SPECTATOR | room=${room_id} | player=${player_id} | isMember=${isMember}`);
            if (game) {
                const currentTurnPlayerId = game.player_ids[game.current_player_index]?.toString();
                const turnUsername = await this.getCachedUsername(currentTurnPlayerId);
                const handCount = Object.fromEntries(Array.from(game.hands.entries()).map(([id, h]) => [id, h.length]));
                const playersData = {};
                for (let i = 0; i < room.players.length; i++) {
                    playersData[`player${i + 1}`] = await this.getCachedUsername(room.players[i].playerId.toString());
                }
                client.emit('domino', {
                    success: true, messages: [], data: {
                        board: game.board, hand: [],
                        boneyardCount: game.boneyard.length,
                        yourTurn: false, turnTimerSeconds: 30,
                        currentTurnUsername: turnUsername,
                        waitingForOpponent: false, gameStarted: true,
                        isSpectator: true, youWon: false,
                        spectatorsCount: room.spectators.length,
                        handCount,
                        ...playersData,
                        shotFrom: turnUsername,
                        turnOf: turnUsername,
                        history: room.players.flatMap((p, i) => p.moves.map(m => ({ ...m.data, player: playersData[`player${i + 1}`] })))
                    }
                });
                client.to(room_id).emit('domino', { success: true, data: { spectatorsCount: room.spectators.length }, messages: [] });
                return;
            }
            else {
                return client.emit('domino', { success: false, messages: [this.i18n.translate('ws.games.gameNotFound', lang)] });
            }
        }
        const playerIndex = room.players.findIndex((p) => p.playerId.toString() === player_id);
        client.data.playerNum = playerIndex + 1;
        if (room.status === 'started' && game) {
            const currentTurnPlayerId = game.player_ids[game.current_player_index]?.toString();
            const isMyTurn = currentTurnPlayerId === player_id;
            const turnUsername = await this.getCachedUsername(currentTurnPlayerId);
            const handCount = Object.fromEntries(Array.from(game.hands.entries()).map(([id, h]) => [id, h.length]));
            const playersData = {};
            for (let i = 0; i < room.players.length; i++) {
                playersData[`player${i + 1}`] = await this.getCachedUsername(room.players[i].playerId.toString());
            }
            const totalTimerSeconds = room.game_id?.turn_timer_seconds || 30;
            const elapsed = game.turn_start_time
                ? Math.floor((Date.now() - game.turn_start_time.getTime()) / 1000)
                : 0;
            const remaining = Math.max(5, totalTimerSeconds - elapsed);
            if (isMyTurn) {
                this.startTimer(client, room_id, remaining);
            }
            this.logger.log(`[Domino] 🏠 Re-joined STARTED game | room=${room_id} | player=${player_id} | asSpectator=${client.data.isSpectator}`);
            return client.emit('domino', {
                success: true, messages: [], data: {
                    board: game.board, hand: game.hands.get(player_id) || [],
                    boneyardCount: game.boneyard.length,
                    yourTurn: isMyTurn, turnTimerSeconds: remaining,
                    currentTurnUsername: turnUsername,
                    waitingForOpponent: false, gameStarted: true, youWon: false, isSpectator: false,
                    handCount,
                    ...playersData,
                    shotFrom: turnUsername,
                    turnOf: turnUsername,
                    history: room.players.flatMap((p, i) => p.moves.map(m => ({ ...m.data, player: playersData[`player${i + 1}`] })))
                }
            });
        }
        const maxPlayers = room.player_limit || room.game_id?.max_players || 2;
        const socketsInRoom = await this.server.in(room_id).fetchSockets();
        client.emit('domino', {
            success: true,
            data: { waitingForOpponent: true, isPlayerOne: playerIndex === 0, playersJoined: socketsInRoom.length, maxPlayers, isSpectator: false },
            messages: [this.i18n.translate('ws.games.waitingOpponent', lang)]
        });
        if (socketsInRoom.length > 1 && room.status === 'waiting' && socketsInRoom.length < maxPlayers) {
            const username = await this.getCachedUsername(player_id);
            client.to(room_id).emit('domino', {
                success: true,
                data: { opponentJoined: true, opponentName: username, waitingForOpponent: true, playersJoined: socketsInRoom.length, maxPlayers },
                messages: [this.i18n.translate('ws.games.opponentJoined', lang, { username })]
            });
        }
        if (socketsInRoom.length >= maxPlayers && room.status === 'waiting') {
            if (room.players.length < maxPlayers)
                return;
            const started = await this.roomModel.findOneAndUpdate({ _id: room_id, status: 'waiting' }, { $set: { status: 'started' } }, { returnDocument: 'after' });
            if (!started)
                return;
            const playerIds = room.players.map((p) => p.playerId);
            const paid = [];
            const compensate = async (errKey, reason) => {
                this.logger.error(`event=domino_start_failed room=${room_id} reason=${reason}`);
                for (const pid of paid) {
                    await this.userModel
                        .updateOne({ _id: pid }, { $inc: { balance: room.bet_amount } })
                        .catch((e) => this.logger.error(`[Domino] Refund failed | player=${pid}`, e));
                }
                await this.dominoModel
                    .deleteOne({ room_id: new mongoose_2.Types.ObjectId(room_id) })
                    .catch((e) => this.logger.error(`[Domino] Game cleanup failed | room=${room_id}`, e));
                await this.roomModel
                    .findByIdAndUpdate(room_id, { $set: { status: 'waiting' } })
                    .catch((e) => this.logger.error(`[Domino] Room status reset failed | room=${room_id}`, e));
                this.server
                    .to(room_id)
                    .emit('domino', { success: false, messages: [this.i18n.translate(errKey, lang)] });
            };
            let allPaid = true;
            for (const pid of playerIds) {
                const deducted = await this.userModel.findOneAndUpdate({ _id: pid, balance: { $gte: room.bet_amount } }, { $inc: { balance: -room.bet_amount } });
                if (!deducted) {
                    allPaid = false;
                    break;
                }
                paid.push(pid);
            }
            if (!allPaid) {
                await compensate('ws.games.insufficientBalance', 'insufficient_balance');
                return;
            }
            let hands;
            let boneyard;
            let startIdx;
            try {
                const dealt = (0, domino_game_logic_1.deal)(playerIds.map((p) => p.toString()));
                hands = dealt.hands;
                boneyard = dealt.boneyard;
                startIdx = (0, domino_game_logic_1.getStartingPlayerIndex)(playerIds.map((p) => p.toString()), hands);
            }
            catch (e) {
                this.logger.error(`[Domino] Deal failed | room=${room_id}`, e);
                await compensate('ws.games.matchmakingError', 'deal_failed');
                return;
            }
            const handsRecord = {};
            hands.forEach((v, k) => { handsRecord[k] = v; });
            try {
                await this.dominoModel.create({ room_id, player_ids: playerIds, hands: handsRecord, boneyard, current_player_index: startIdx, turn_start_time: new Date() });
            }
            catch (e) {
                this.logger.error(`[Domino] Game create failed | room=${room_id}`, e);
                await compensate('ws.games.matchmakingError', 'game_create_failed');
                return;
            }
            const timerSec = room.game_id?.turn_timer_seconds ?? 30;
            const startingPlayerId = playerIds[startIdx].toString();
            const startingUsername = await this.getCachedUsername(startingPlayerId);
            for (const s of socketsInRoom) {
                const pid = s.data.player_id;
                const sIsSpectator = s.data.isSpectator || false;
                const myHand = sIsSpectator ? [] : (hands.get(pid) || []);
                const isMyTurn = sIsSpectator ? false : startingPlayerId === pid;
                const sLang = this.getLang(s);
                s.emit('domino', { success: true, data: { hand: myHand, board: [], boneyardCount: boneyard.length, yourTurn: isMyTurn, turnTimerSeconds: timerSec, currentTurnUsername: startingUsername, gameStarted: true, isSpectator: sIsSpectator }, messages: sIsSpectator ? [this.i18n.translate('ws.games.gameStarted', sLang)] : [isMyTurn ? this.i18n.translate('ws.games.yourTurn', sLang) : this.i18n.translate('ws.games.gameStarted', sLang)] });
                if (isMyTurn)
                    this.startTimer(s, room_id, timerSec);
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
            return client.emit('domino', { success: false, messages: [this.i18n.translate('ws.games.spectatorActionDenied', lang)] });
        const room_id = payload.room_id || client.data.room_id;
        const { tile, side } = payload;
        const player_id = client.data.player_id;
        if (!room_id || !tile || !side) {
            this.logger.warn(`[Domino] ❌ Invalid move payload | player=${player_id} | payload=${JSON.stringify(payload)} | socketRoom=${client.data.room_id}`);
            return client.emit('domino', { success: false, messages: [this.i18n.translate('ws.games.invalidMove', lang)] });
        }
        await this.runWithRetry(async () => {
            const game = await this.dominoModel.findOne({ room_id: new mongoose_2.Types.ObjectId(room_id) });
            if (!game)
                throw new Error('Game not found');
            if (game.player_ids[game.current_player_index]?.toString() !== player_id)
                throw new Error('Not your turn');
            const { valid, flippedTile } = (0, domino_game_logic_1.validateMove)(tile, side, game.open_ends || {});
            if (!valid) {
                this.logger.warn(`[Domino] ❌ Invalid move (validation failed) | player=${player_id} | tile=${JSON.stringify(tile)} | side=${side} | open_ends=${JSON.stringify(game.open_ends)}`);
                client.emit('domino', { success: false, messages: [this.i18n.translate('ws.games.invalidMove', lang)] });
                return;
            }
            const hand = game.hands.get(player_id) || [];
            const t0 = Number(tile[0]), t1 = Number(tile[1]);
            const tileIdx = hand.findIndex(([v1, v2]) => (v1 === t0 && v2 === t1) || (v1 === t1 && v2 === t0));
            if (tileIdx === -1) {
                this.logger.warn(`[Domino] ❌ Invalid move (tile not in hand) | player=${player_id} | tile=${JSON.stringify(tile)} | hand=${JSON.stringify(hand)}`);
                client.emit('domino', { success: false, messages: [this.i18n.translate('ws.games.invalidMove', lang)] });
                return;
            }
            await this.roomModel.updateOne({ _id: new mongoose_2.Types.ObjectId(room_id), 'players.playerId': new mongoose_2.Types.ObjectId(player_id) }, { $push: { 'players.$.moves': { data: { tile, side, type: 'move' } } } });
            const newHand = hand.filter((_, i) => i !== tileIdx);
            game.hands.set(player_id, newHand);
            if (side === 'left') {
                game.board = [flippedTile, ...game.board];
                game.open_ends = { left: flippedTile[0], right: game.board.length === 1 ? flippedTile[1] : game.open_ends?.right };
            }
            else {
                game.board = [...game.board, flippedTile];
                game.open_ends = { right: flippedTile[1], left: game.board.length === 1 ? flippedTile[0] : game.open_ends?.left };
            }
            game.consecutive_passes = 0;
            const playerIdsStr = game.player_ids.map((p) => p.toString());
            const eliminated = game.eliminated_players || [];
            game.current_player_index = (0, domino_game_logic_1.getNextActivePlayerIndex)(game.current_player_index, playerIdsStr, eliminated);
            game.turn_start_time = new Date();
            const handsObj = Object.fromEntries(game.hands);
            const result = (0, domino_game_logic_1.getDominoGameResult)(new Map(Object.entries(handsObj)), game.consecutive_passes, playerIdsStr, eliminated);
            const room = await this.roomModel.findById(room_id);
            if (result.finished && room) {
                room.status = 'finished';
                room.winner_reason = result.reason;
                room.finished_at = new Date();
                if (result.winner) {
                    room.winner = new mongoose_2.Types.ObjectId(result.winner);
                    const grossPayout = (0, game_prize_util_1.winnerGrossPayout)(room.bet_amount, room.house_edge, room.players.length);
                    await this.userModel.updateOne({ _id: result.winner }, { $inc: { balance: grossPayout } });
                }
                await room.save();
                const gameId = room.game_id?._id?.toString() || room.game_id?.toString();
                if (gameId)
                    this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
            }
            game.markModified('hands');
            game.markModified('board');
            game.markModified('open_ends');
            await game.save();
            this.logger.log(`[Domino] ✅ Move SUCCESS | player=${player_id} | tile=${JSON.stringify(tile)} | boardLen=${game.board.length} | ends=${JSON.stringify(game.open_ends)} | tilesRemaining=${newHand.length}`);
            const handCount = Object.fromEntries(Array.from(game.hands.entries()).map(([id, h]) => [id, h.length]));
            const sockets = await this.server.in(room_id).fetchSockets();
            const nextPlayerId = game.player_ids[game.current_player_index].toString();
            const nextUsername = await this.getCachedUsername(nextPlayerId);
            const timerSec = 30;
            clearTimer(client.id);
            const nextPlayerSocket = sockets.find(s => s.data.player_id === nextPlayerId);
            if (!result.finished && nextPlayerSocket)
                this.startTimer(nextPlayerSocket, room_id, timerSec);
            const shotFrom = await this.getCachedUsername(player_id);
            for (const s of sockets) {
                const pid = s.data.player_id;
                const sIsSpectator = s.data.isSpectator || false;
                const sLang = this.getLang(s);
                const myHand = sIsSpectator ? [] : (game.hands.get(pid) || []);
                const isMyTurn = !sIsSpectator && pid === nextPlayerId;
                const isWinner = !sIsSpectator && result.winner === pid;
                const outcome = isWinner ? 'win' : (result.finished && result.winner ? 'lose' : (result.finished ? 'draw' : ''));
                const prize = isWinner && room
                    ? (0, game_prize_util_1.winnerDisplayedPrize)(room.bet_amount, room.house_edge, room.players.length)
                    : 0;
                const sData = { board: game.board, hand: myHand, boneyardCount: game.boneyard.length, lastTile: flippedTile, lastSide: side, lastPlayer: player_id, gameEnded: result.finished, outcome, youWon: isWinner, winner: result.winner, reason: result.reason, prize, yourTurn: isMyTurn, turnTimerSeconds: timerSec, currentTurnUsername: nextUsername, handCount, isSpectator: sIsSpectator };
                if (sIsSpectator) {
                    sData.shotFrom = shotFrom;
                    sData.turnOf = nextUsername;
                    if (result.finished && result.winner)
                        sData.winner = result.winner ? await this.getCachedUsername(result.winner) : null;
                }
                let msg = '';
                if (result.finished)
                    msg = isWinner ? this.i18n.translate('ws.games.youWin', sLang) : this.i18n.translate('ws.games.gameOver', sLang);
                else
                    msg = isMyTurn ? this.i18n.translate('ws.domino.yourTurn', sLang) : this.i18n.translate('ws.domino.waitingForOther', sLang, { username: nextUsername });
                s.emit('domino', { success: true, data: sData, messages: [msg] });
            }
        });
    }
    async handleDraw(client, payload) {
        const lang = this.getLang(client);
        const room_id = payload.room_id || client.data.room_id;
        if (!room_id)
            return client.emit('domino', { success: false, messages: [this.i18n.translate('ws.games.invalidMove', lang)] });
        const player_id = client.data.player_id;
        await this.runWithRetry(async () => {
            const game = await this.dominoModel.findOne({ room_id: new mongoose_2.Types.ObjectId(room_id) });
            if (!game)
                throw new Error('Game not found');
            if (game.player_ids[game.current_player_index]?.toString() !== player_id)
                throw new Error('Not your turn');
            if (game.boneyard.length === 0) {
                client.emit('domino', { success: false, messages: [this.i18n.translate('ws.domino.boneyardEmpty', lang)] });
                return;
            }
            const currentBoneyard = [...game.boneyard];
            const drawn = currentBoneyard.pop();
            if (!drawn)
                throw new Error('Boneyard unexpectedly empty');
            const hand = game.hands.get(player_id) || [];
            const newHand = [...hand, drawn];
            game.hands.set(player_id, newHand);
            game.boneyard = currentBoneyard;
            game.markModified('hands');
            game.markModified('boneyard');
            await game.save();
            this.logger.log(`[Domino] 🁣 Draw SUCCESS | player=${player_id} | drawn=${JSON.stringify(drawn)} | boneyardLeft=${game.boneyard.length} | handSize=${newHand.length}`);
            const handCount = Object.fromEntries(Array.from(game.hands.entries()).map(([id, h]) => [id, h.length]));
            const sockets = await this.server.in(room_id).fetchSockets();
            const timerSec = 30;
            clearTimer(client.id);
            const nextPlayerSocket = sockets.find(s => s.data.player_id === player_id);
            if (nextPlayerSocket)
                this.startTimer(nextPlayerSocket, room_id, timerSec);
            const turnUsername = await this.getCachedUsername(player_id);
            for (const s of sockets) {
                const pid = s.data.player_id;
                const sIsSpectator = s.data.isSpectator || false;
                const sLang = this.getLang(s);
                const myHand = sIsSpectator ? [] : (game.hands.get(pid) || []);
                const isDrawingPlayer = !sIsSpectator && pid === player_id;
                const sData = { board: game.board, hand: myHand, boneyardCount: game.boneyard.length, lastTile: null, lastSide: null, lastPlayer: player_id, yourTurn: isDrawingPlayer, turnTimerSeconds: timerSec, currentTurnUsername: turnUsername, handCount, isSpectator: sIsSpectator };
                if (sIsSpectator) {
                    sData.shotFrom = turnUsername;
                    sData.turnOf = turnUsername;
                }
                const msg = isDrawingPlayer ? this.i18n.translate('ws.domino.drewTile', sLang) : this.i18n.translate('ws.domino.opponentDrew', sLang, { username: turnUsername });
                s.emit('domino', { success: true, data: sData, messages: [msg] });
            }
        });
    }
    async handlePass(client, payload) {
        const lang = this.getLang(client);
        const room_id = payload.room_id || client.data.room_id;
        if (!room_id)
            return client.emit('domino', { success: false, messages: [this.i18n.translate('ws.games.invalidMove', lang)] });
        const player_id = client.data.player_id;
        await this.runWithRetry(async () => {
            const game = await this.dominoModel.findOne({ room_id: new mongoose_2.Types.ObjectId(room_id) });
            if (!game)
                throw new Error('Game not found');
            if (game.player_ids[game.current_player_index]?.toString() !== player_id)
                throw new Error('Not your turn');
            game.consecutive_passes++;
            const playerIdsStr = game.player_ids.map((p) => p.toString());
            const eliminated = game.eliminated_players || [];
            game.current_player_index = (0, domino_game_logic_1.getNextActivePlayerIndex)(game.current_player_index, playerIdsStr, eliminated);
            game.turn_start_time = new Date();
            const handsObj = Object.fromEntries(game.hands);
            const result = (0, domino_game_logic_1.getDominoGameResult)(new Map(Object.entries(handsObj)), game.consecutive_passes, playerIdsStr, eliminated);
            const room = await this.roomModel.findById(room_id);
            if (result.finished && room) {
                room.status = 'finished';
                room.winner_reason = result.reason;
                room.finished_at = new Date();
                if (result.winner) {
                    room.winner = new mongoose_2.Types.ObjectId(result.winner);
                    const grossPayout = (0, game_prize_util_1.winnerGrossPayout)(room.bet_amount, room.house_edge, room.players.length);
                    await this.userModel.updateOne({ _id: result.winner }, { $inc: { balance: grossPayout } });
                }
                await room.save();
                const gameId = room.game_id?._id?.toString() || room.game_id?.toString();
                if (gameId)
                    this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
            }
            game.markModified('consecutive_passes');
            await game.save();
            this.logger.log(`[Domino] ⏩ Pass SUCCESS | player=${player_id} | consecutivePasses=${game.consecutive_passes}`);
            const handCount = Object.fromEntries(Array.from(game.hands.entries()).map(([id, h]) => [id, h.length]));
            const sockets = await this.server.in(room_id).fetchSockets();
            const nextPlayerId = game.player_ids[game.current_player_index].toString();
            const nextUsername = await this.getCachedUsername(nextPlayerId);
            const timerSec = 30;
            clearTimer(client.id);
            const nextPlayerSocket = sockets.find(s => s.data.player_id === nextPlayerId);
            if (!result.finished && nextPlayerSocket)
                this.startTimer(nextPlayerSocket, room_id, timerSec);
            const shotFrom = await this.getCachedUsername(player_id);
            for (const s of sockets) {
                const pid = s.data.player_id;
                const sIsSpectator = s.data.isSpectator || false;
                const sLang = this.getLang(s);
                const myHand = sIsSpectator ? [] : (game.hands.get(pid) || []);
                const sIsMyTurn = !sIsSpectator && pid === nextPlayerId;
                const isWinner = !sIsSpectator && result.winner === pid;
                const outcome = isWinner ? 'win' : (result.finished && result.winner ? 'lose' : (result.finished ? 'draw' : ''));
                const prize = isWinner && room
                    ? (0, game_prize_util_1.winnerDisplayedPrize)(room.bet_amount, room.house_edge, room.players.length)
                    : 0;
                const sData = { board: game.board, hand: myHand, boneyardCount: game.boneyard.length, lastTile: null, lastSide: null, lastPlayer: player_id, passed: true, gameEnded: result.finished, outcome, youWon: isWinner, winner: result.winner, reason: result.reason, prize, yourTurn: sIsMyTurn, turnTimerSeconds: timerSec, currentTurnUsername: nextUsername, handCount, isSpectator: sIsSpectator };
                if (sIsSpectator) {
                    sData.shotFrom = shotFrom;
                    sData.turnOf = nextUsername;
                    if (result.finished && result.winner)
                        sData.winner = result.winner ? await this.getCachedUsername(result.winner) : null;
                }
                let msg = '';
                if (result.finished)
                    msg = this.i18n.translate('ws.games.gameOver', sLang);
                else
                    msg = sIsMyTurn ? this.i18n.translate('ws.domino.opponentPassed', sLang, { username: shotFrom }) : (pid === player_id ? this.i18n.translate('ws.domino.passed', sLang) : this.i18n.translate('ws.domino.opponentPassed', sLang, { username: shotFrom }));
                s.emit('domino', { success: true, data: sData, messages: [msg] });
            }
        });
    }
    startTimer(socket, room_id, seconds) {
        const player_id = socket.data?.player_id;
        if (!player_id)
            return;
        clearTimer(socket.id);
        void this.turnDeadlines.schedule('domino', room_id, player_id, seconds);
        const t = setTimeout(async () => {
            const game = await this.dominoModel.findOne({ room_id: new mongoose_2.Types.ObjectId(room_id) });
            if (!game || game.status !== 'active')
                return;
            const currentPlayerId = game.player_ids[game.current_player_index]?.toString();
            if (currentPlayerId !== player_id)
                return;
            const lang = this.getLang(socket);
            socket.emit('domino', { success: true, data: { gameEnded: true, outcome: 'timeout_loss', youWon: false, reason: 'timeout', isSpectator: false }, messages: [this.i18n.translate('ws.domino.timeout', lang)] });
            socket.data.eliminationReason = 'timeout';
            await this.eliminatePlayer(room_id, player_id, 'timeout');
            socket.leave(room_id);
            socket.disconnect(true);
        }, seconds * 1000);
        turnTimers.set(socket.id, t);
    }
    async eliminatePlayer(room_id, player_id, reason) {
        await this.runWithRetry(async () => {
            await this.redis.del(`grace_period:domino:${player_id}`);
            const game = await this.dominoModel.findOne({ room_id: new mongoose_2.Types.ObjectId(room_id) });
            if (!game)
                return;
            const room = await this.roomModel.findById(room_id);
            if (!room || room.status !== 'started')
                return;
            const playerIdsStr = game.player_ids.map((p) => p.toString());
            const eliminated = game.eliminated_players || [];
            if (eliminated.includes(player_id))
                return;
            const hand = game.hands.get(player_id) || [];
            if (hand.length > 0) {
                this.logger.log(`[Domino] 🔄 Returning tiles to boneyard | player=${player_id} | tiles=${JSON.stringify(hand)}`);
                game.boneyard = [...game.boneyard, ...hand];
                game.hands.set(player_id, []);
            }
            this.logger.log(`[Domino] 🚪 ELIMINATING player | player=${player_id} | reason=${reason} | remainingActive=${playerIdsStr.filter(id => !eliminated.includes(id) && id !== player_id).length}`);
            const newEliminated = [...eliminated, player_id];
            game.eliminated_players = newEliminated;
            const currentPlayerId = playerIdsStr[game.current_player_index];
            if (currentPlayerId === player_id) {
                game.current_player_index = (0, domino_game_logic_1.getNextActivePlayerIndex)(game.current_player_index, playerIdsStr, newEliminated);
                game.turn_start_time = new Date();
            }
            game.consecutive_passes = 0;
            const handsObj = Object.fromEntries(game.hands);
            const result = (0, domino_game_logic_1.getDominoGameResult)(new Map(Object.entries(handsObj)), game.consecutive_passes, playerIdsStr, newEliminated);
            if (result.finished) {
                room.status = 'finished';
                room.winner_reason = result.reason || reason;
                room.finished_at = new Date();
                if (result.winner) {
                    room.winner = new mongoose_2.Types.ObjectId(result.winner);
                    const grossPayout = (0, game_prize_util_1.winnerGrossPayout)(room.bet_amount, room.house_edge, room.players.length);
                    await this.userModel.updateOne({ _id: result.winner }, { $inc: { balance: grossPayout } });
                }
                await room.save();
                const gameId = room.game_id?._id?.toString() || room.game_id?.toString();
                if (gameId)
                    this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
            }
            game.markModified("hands");
            game.markModified("boneyard");
            game.markModified("eliminated_players");
            await game.save();
            const sockets = await this.server.in(room_id).fetchSockets();
            const nextPlayerId = playerIdsStr[game.current_player_index];
            const nextUsername = await this.getCachedUsername(nextPlayerId);
            const eliminatedUsername = await this.getCachedUsername(player_id);
            const timerSec = 30;
            const handCount = Object.fromEntries(Array.from(game.hands.entries()).map(([id, h]) => [id, h.length]));
            if (!result.finished) {
                const nextPlayerSocket = sockets.find(s => s.data.player_id === nextPlayerId);
                if (nextPlayerSocket)
                    this.startTimer(nextPlayerSocket, room_id, timerSec);
            }
            for (const s of sockets) {
                const pid = s.data.player_id;
                const sIsSpectator = s.data.isSpectator || false;
                const sLang = this.getLang(s);
                const myHand = sIsSpectator ? [] : (game.hands.get(pid) || []);
                const sIsMyTurn = !sIsSpectator && pid === nextPlayerId;
                const isWinner = !sIsSpectator && result.winner === pid;
                const outcome = isWinner ? 'win' : (result.finished && result.winner ? 'lose' : (result.finished ? 'draw' : ''));
                const prize = isWinner && room
                    ? (0, game_prize_util_1.winnerDisplayedPrize)(room.bet_amount, room.house_edge, room.players.length)
                    : 0;
                const sData = { board: game.board, hand: myHand, boneyardCount: game.boneyard.length, yourTurn: !result.finished && sIsMyTurn, turnTimerSeconds: timerSec, currentTurnUsername: nextUsername, playerEliminated: eliminatedUsername, eliminationReason: reason, gameEnded: result.finished, outcome, youWon: isWinner, winner: result.winner, reason: result.reason || reason, prize, handCount, isSpectator: sIsSpectator };
                if (sIsSpectator) {
                    sData.shotFrom = eliminatedUsername;
                    sData.turnOf = nextUsername;
                    if (result.finished && result.winner)
                        sData.winner = result.winner ? await this.getCachedUsername(result.winner) : null;
                }
                let msg = '';
                if (result.finished)
                    msg = isWinner ? this.i18n.translate('ws.domino.youWinElimination', sLang) : this.i18n.translate('ws.games.gameOver', sLang);
                else
                    msg = this.i18n.translate('ws.domino.playerEliminated', sLang, { username: eliminatedUsername });
                s.emit('domino', { success: true, data: sData, messages: [msg] });
            }
        });
    }
};
exports.DominoGateway = DominoGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], DominoGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('join'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], DominoGateway.prototype, "handleJoin", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('move'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], DominoGateway.prototype, "handleMove", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('draw'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], DominoGateway.prototype, "handleDraw", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('pass'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], DominoGateway.prototype, "handlePass", null);
exports.DominoGateway = DominoGateway = DominoGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({ namespace: '/domino', cors: { origin: '*', credentials: true } }),
    __param(0, (0, mongoose_1.InjectModel)(domino_game_schema_1.DominoGame.name)),
    __param(1, (0, mongoose_1.InjectModel)('Room')),
    __param(2, (0, mongoose_1.InjectModel)('User')),
    __param(5, (0, common_1.Inject)(redis_module_1.REDIS_CLIENT)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        config_1.ConfigService,
        rooms_gateway_1.RoomsGateway, Object, i18n_service_1.I18nService,
        grace_period_service_1.GracePeriodService,
        turn_deadline_service_1.TurnDeadlineService])
], DominoGateway);
//# sourceMappingURL=domino.gateway.js.map