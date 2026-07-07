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
var UnoGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnoGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const mongoose_1 = require("@nestjs/mongoose");
const config_1 = require("@nestjs/config");
const grace_period_service_1 = require("../../../common/grace-period/grace-period.service");
const socket_io_1 = require("socket.io");
const mongoose_2 = require("mongoose");
const ws_auth_middleware_1 = require("../../../common/guards/ws-auth.middleware");
const redis_module_1 = require("../../../common/redis/redis.module");
const uno_game_constants_1 = require("../../../common/constants/uno-game.constants");
const rooms_gateway_1 = require("../rooms/rooms.gateway");
const uno_game_schema_1 = require("./schemas/uno-game.schema");
const uno_game_logic_1 = require("./uno-game.logic");
const i18n_service_1 = require("../../../common/i18n/i18n.service");
const game_prize_util_1 = require("../../../common/utils/game-prize.util");
const turnTimers = new Map();
const clearTimer = (id) => {
    const t = turnTimers.get(id);
    if (t) {
        clearTimeout(t);
        turnTimers.delete(id);
    }
};
const BETWEEN_ROUNDS_SECONDS = 8;
let UnoGateway = UnoGateway_1 = class UnoGateway {
    unoModel;
    roomModel;
    userModel;
    config;
    roomsGateway;
    redis;
    i18n;
    grace;
    server;
    logger = new common_1.Logger(UnoGateway_1.name);
    usernameCache = new Map();
    constructor(unoModel, roomModel, userModel, config, roomsGateway, redis, i18n, grace) {
        this.unoModel = unoModel;
        this.roomModel = roomModel;
        this.userModel = userModel;
        this.config = config;
        this.roomsGateway = roomsGateway;
        this.redis = redis;
        this.i18n = i18n;
        this.grace = grace;
    }
    onModuleInit() {
        this.grace.registerHandler('uno', (playerId, roomId) => this.eliminatePlayer(roomId, playerId, 'forfeit'));
    }
    async runWithRetry(fn, maxRetries = 3) {
        let lastError;
        for (let i = 0; i < maxRetries; i++) {
            try {
                return await fn();
            }
            catch (error) {
                if (error?.name === 'VersionError' || error?.message?.includes('version')) {
                    this.logger.warn(`[UNO] Version collision, retry ${i + 1}/${maxRetries}`);
                    lastError = error;
                    await new Promise((r) => setTimeout(r, 50 * (i + 1)));
                    continue;
                }
                throw error;
            }
        }
        throw lastError;
    }
    getLang(client) {
        return client.handshake?.query?.lang || client.data?.lang || 'en';
    }
    async getCachedUsername(userId) {
        if (this.usernameCache.has(userId))
            return this.usernameCache.get(userId);
        const user = await this.userModel.findById(userId).select('username').lean();
        const username = user?.username || 'Unknown';
        if (user)
            this.usernameCache.set(userId, username);
        return username;
    }
    getHands(game) {
        if (game.hands instanceof Map)
            return game.hands;
        return new Map(Object.entries(game.hands || {}));
    }
    afterInit(server) {
        (0, ws_auth_middleware_1.applyWsAuth)(server, this.config, this.redis);
    }
    handleConnection(client) {
        this.logger.log(`[UNO] Connected: ${client.id}`);
    }
    async handleDisconnect(client) {
        clearTimer(client.id);
        const { room_id, player_id } = client.data;
        if (!room_id || !player_id)
            return;
        const roomObjId = new mongoose_2.Types.ObjectId(room_id);
        const playerObjId = new mongoose_2.Types.ObjectId(player_id);
        const room = await this.roomModel.findOne({
            _id: roomObjId,
            $or: [{ 'players.playerId': playerObjId }, { spectators: playerObjId }],
        });
        if (!room || room.status === 'finished')
            return;
        const isSpectator = room.spectators?.some((id) => id.toString() === player_id);
        if (isSpectator) {
            const updated = await this.roomModel.findOneAndUpdate({ _id: roomObjId }, { $pull: { spectators: playerObjId } }, { returnDocument: 'after' });
            client.to(room_id).emit('uno', {
                success: true,
                data: { spectatorsCount: updated?.spectators?.length || 0 },
                messages: [],
            });
            return;
        }
        if (room.status === 'waiting') {
            const updated = await this.roomModel.findOneAndUpdate({ _id: roomObjId, 'players.playerId': playerObjId }, { $pull: { players: { playerId: playerObjId } } }, { returnDocument: 'after' });
            if (!updated)
                return;
            const gameIdForLobby = room.game_id?._id?.toString() || room.game_id?.toString();
            if (updated.players.length === 0) {
                await this.roomModel.findOneAndDelete({ _id: roomObjId, players: { $size: 0 } });
                if (gameIdForLobby) {
                    this.roomsGateway.broadcastRoomUpdate(gameIdForLobby, 'roomDeleted', { id: room_id });
                }
            }
            else {
                const username = await this.getCachedUsername(player_id);
                const maxPlayers = room.player_limit || room.game_id?.max_players || 2;
                const lang = this.getLang(client);
                client.to(room_id).emit('uno', {
                    success: true,
                    data: {
                        opponentLeft: true,
                        waitingForOpponent: true,
                        playerLeft: username,
                        playersRemaining: updated.players.length,
                        playersRequired: maxPlayers,
                    },
                    messages: ['ws.domino.playerLeftWaiting'],
                });
                if (gameIdForLobby) {
                    const populated = await this.roomModel
                        .findById(roomObjId)
                        .populate('game_id', '-created_at')
                        .populate('players.playerId', 'username')
                        .lean();
                    if (populated) {
                        this.roomsGateway.broadcastRoomUpdate(gameIdForLobby, 'roomUpdated', populated);
                    }
                }
            }
            return;
        }
        if (room.status === 'started') {
            const reason = client.data.eliminationReason || 'forfeit';
            if (reason === 'timeout') {
                await this.eliminatePlayer(room_id, player_id, 'timeout');
                return;
            }
            const game = await this.unoModel.findOne({ room_id: roomObjId });
            let remainingTurnSecs = 0;
            if (game) {
                const idsStr = game.player_ids.map((p) => p.toString());
                const currentId = idsStr[game.current_player_index];
                if (currentId === player_id) {
                    const turnStart = game.turn_start_time?.getTime() ?? Date.now();
                    const limit = (room.game_id?.turn_timer_seconds || 30) * 1000;
                    remainingTurnSecs = Math.ceil((limit - (Date.now() - turnStart)) / 1000);
                }
            }
            await this.grace.start('uno', player_id, room_id, Math.max(60, remainingTurnSecs));
        }
    }
    async handleJoin(client, payload) {
        const lang = this.getLang(client);
        const player_id = client.data.player_id;
        let room_id = payload?.room_id;
        await this.grace.cancel('uno', player_id);
        if (!room_id) {
            return client.emit('uno', {
                success: false,
                messages: ['ws.invalidMessageFormat'],
            });
        }
        const room = await this.roomModel.findById(room_id).populate('game_id', 'socket_code turn_timer_seconds max_players');
        if (!room) {
            return client.emit('uno', {
                success: false,
                messages: ['ws.games.gameNotFound'],
            });
        }
        if (room.game_id?.socket_code !== uno_game_constants_1.UNO_SOCKET_CODE) {
            return client.emit('uno', {
                success: false,
                messages: ['ws.uno.wrongGame'],
            });
        }
        if (room.status === 'finished') {
            return client.emit('uno', {
                success: false,
                messages: ['ws.games.roomInactive'],
            });
        }
        await client.join(room_id);
        client.data.room_id = room_id;
        const game = await this.unoModel.findOne({ room_id: new mongoose_2.Types.ObjectId(room_id) });
        const isMember = room.players.some((p) => p.playerId.toString() === player_id);
        const isEliminated = game?.eliminated_players?.includes(player_id);
        client.data.isSpectator = !isMember || !!isEliminated;
        const timerSec = room.game_id?.turn_timer_seconds ?? 45;
        const maxPlayers = room.player_limit || room.game_id?.max_players || 10;
        if (client.data.isSpectator && game) {
            await this.emitUnoStateToClient(client, room, game, timerSec, lang);
            return;
        }
        if (!isMember) {
            return client.emit('uno', {
                success: false,
                messages: ['ws.games.notInRoom'],
            });
        }
        const playerIndex = room.players.findIndex((p) => p.playerId.toString() === player_id);
        client.data.playerNum = playerIndex + 1;
        if (room.status === 'started' && game) {
            await this.emitUnoStateToClient(client, room, game, timerSec, lang);
            return;
        }
        const socketsInRoom = await this.server.in(room_id).fetchSockets();
        client.emit('uno', {
            success: true,
            data: {
                waitingForOpponent: true,
                isPlayerOne: playerIndex === 0,
                playersJoined: socketsInRoom.length,
                maxPlayers,
                isSpectator: false,
            },
            messages: ['ws.games.waitingOpponent'],
        });
        if (socketsInRoom.length > 1 && room.status === 'waiting' && socketsInRoom.length < maxPlayers) {
            const username = await this.getCachedUsername(player_id);
            client.to(room_id).emit('uno', {
                success: true,
                data: {
                    opponentJoined: true,
                    opponentName: username,
                    waitingForOpponent: true,
                    playersJoined: socketsInRoom.length,
                    maxPlayers,
                },
                messages: ['ws.games.opponentJoined'],
            });
        }
        if (socketsInRoom.length >= maxPlayers && room.status === 'waiting') {
            await this.tryStartUnoGame(room_id, lang);
        }
    }
    async tryStartUnoGame(room_id, lang) {
        const preRoom = await this.roomModel.findById(room_id).populate('game_id', 'max_players uno_match_target');
        if (!preRoom)
            return;
        const expectedPlayers = preRoom.player_limit || preRoom.game_id?.max_players || 0;
        if (expectedPlayers === 0 ||
            preRoom.players.length < expectedPlayers ||
            preRoom.players.some((p) => !p?.playerId)) {
            this.logger.warn(`event=uno_start_aborted room=${room_id} reason=not_enough_distinct_players players=${preRoom.players.length} expected=${expectedPlayers}`);
            return;
        }
        const started = await this.roomModel.findOneAndUpdate({ _id: room_id, status: 'waiting' }, { $set: { status: 'started' } }, { returnDocument: 'after' });
        if (!started)
            return;
        const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds max_players uno_match_target');
        if (!room)
            return;
        const playerIds = room.players.map((p) => p.playerId);
        const paid = [];
        let allPaid = true;
        for (const pid of playerIds) {
            const deducted = await this.userModel.findOneAndUpdate({ _id: pid, balance: { $gte: room.bet_amount } }, { $inc: { balance: -room.bet_amount } }, { returnDocument: 'after' });
            if (!deducted) {
                allPaid = false;
                break;
            }
            paid.push(pid);
        }
        if (!allPaid) {
            for (const pid of paid)
                await this.userModel.updateOne({ _id: pid }, { $inc: { balance: room.bet_amount } });
            await this.roomModel.findByIdAndUpdate(room_id, { $set: { status: 'waiting' } });
            this.server.to(room_id).emit('uno', {
                success: false,
                messages: ['ws.games.insufficientBalance'],
            });
            return;
        }
        const compensate = async (reason, errKey) => {
            this.logger.error(`event=uno_start_failed room=${room_id} reason=${reason}`);
            for (const pid of paid) {
                await this.userModel
                    .updateOne({ _id: pid }, { $inc: { balance: room.bet_amount } })
                    .catch((e) => this.logger.error(`[UNO] Refund failed | player=${pid}`, e));
            }
            await this.unoModel
                .deleteOne({ room_id: new mongoose_2.Types.ObjectId(room_id) })
                .catch((e) => this.logger.error(`[UNO] Game cleanup failed | room=${room_id}`, e));
            await this.roomModel
                .findByIdAndUpdate(room_id, { $set: { status: 'waiting' } })
                .catch((e) => this.logger.error(`[UNO] Room status reset failed | room=${room_id}`, e));
            this.server.to(room_id).emit('uno', {
                success: false,
                messages: [errKey],
            });
        };
        const playerIdStrs = playerIds.map((p) => p.toString());
        let deal;
        try {
            deal = (0, uno_game_logic_1.dealUnoInitialState)(playerIdStrs);
        }
        catch (e) {
            this.logger.error(`[UNO] Deal failed | room=${room_id}`, e);
            await compensate('deal_failed', 'ws.games.matchmakingError');
            return;
        }
        const matchTarget = (0, uno_game_constants_1.resolveUnoMatchTarget)(room.game_id?.uno_match_target, this.config.get('UNO_MATCH_TARGET'));
        const initialScores = {};
        for (const id of playerIdStrs)
            initialScores[id] = 0;
        let game;
        try {
            game = await this.unoModel.create({
                room_id: new mongoose_2.Types.ObjectId(room_id),
                player_ids: playerIds,
                hands: deal.hands,
                draw_pile: deal.drawPile,
                discard_pile: deal.discardPile,
                current_player_index: 0,
                direction: 1,
                current_color: deal.currentColor,
                draw_stack_pending: 0,
                eliminated_players: [],
                turn_start_time: new Date(),
                uno_called: [],
                pending_uno_offender: null,
                last_action_player_id: null,
                match_scores: initialScores,
                round_number: 1,
                match_target_score: matchTarget,
                match_winner_id: null,
                between_rounds: false,
                next_round_starts_at: null,
                players_ready_for_next: [],
                round_history: [],
            });
        }
        catch (e) {
            this.logger.error(`[UNO] Game create failed | room=${room_id}`, e);
            await compensate('game_create_failed', 'ws.games.matchmakingError');
            return;
        }
        if (!game) {
            await compensate('game_create_returned_null', 'ws.games.matchmakingError');
            return;
        }
        const timerSec = room.game_id?.turn_timer_seconds ?? 45;
        const sockets = await this.server.in(room_id).fetchSockets();
        const currentTurnId = playerIdStrs[game.current_player_index];
        const currentTurnUsername = await this.getCachedUsername(currentTurnId);
        for (const s of sockets) {
            const pid = s.data.player_id;
            const sLang = this.getLang(s);
            const isSpectator = s.data.isSpectator || false;
            const isMyTurn = !isSpectator && pid === currentTurnId;
            const data = await this.buildUnoPayloadSync(game, room, pid, isSpectator, timerSec, currentTurnUsername);
            s.emit('uno', {
                success: true,
                data: { ...data, gameStarted: true },
                messages: [
                    isSpectator
                        ? 'ws.games.gameStarted'
                        : isMyTurn
                            ? 'ws.games.yourTurn'
                            : 'ws.games.gameStarted',
                ],
            });
            if (isMyTurn)
                this.startTimer(s, room_id, timerSec);
        }
        const gId = room.game_id?._id?.toString() || room.game_id?.toString();
        const populated = await this.roomModel.findById(room_id).populate('game_id', '-created_at').populate('players.playerId', 'username').lean();
        if (gId)
            this.roomsGateway.broadcastRoomUpdate(gId, 'roomUpdated', populated);
    }
    async handleSync(client, payload) {
        const lang = this.getLang(client);
        const room_id = payload?.room_id || client.data.room_id;
        const player_id = client.data.player_id;
        if (!room_id) {
            return client.emit('uno', { success: false, messages: ['ws.invalidMessageFormat'] });
        }
        const room = await this.roomModel.findById(room_id).populate('game_id', 'socket_code turn_timer_seconds max_players');
        if (!room) {
            return client.emit('uno', { success: false, messages: ['ws.games.gameNotFound'] });
        }
        const game = await this.unoModel.findOne({ room_id: new mongoose_2.Types.ObjectId(room_id) });
        if (!game || room.status !== 'started') {
            return client.emit('uno', { success: false, messages: ['ws.games.roomInactive'] });
        }
        const timerSec = room.game_id?.turn_timer_seconds ?? 45;
        await this.emitUnoStateToClient(client, room, game, timerSec, lang);
    }
    async handlePlayCard(client, payload) {
        const lang = this.getLang(client);
        if (client.data.isSpectator) {
            return client.emit('uno', {
                success: false,
                messages: ['ws.games.spectatorActionDenied'],
            });
        }
        const room_id = payload?.room_id || client.data.room_id;
        const player_id = client.data.player_id;
        if (room_id === undefined || room_id === null || payload?.card_index === undefined || payload?.card_index === null) {
            return client.emit('uno', { success: false, messages: ['ws.invalidMessageFormat'] });
        }
        const cardIndex = Number(payload.card_index);
        if (!Number.isInteger(cardIndex) || cardIndex < 0) {
            return client.emit('uno', { success: false, messages: ['ws.uno.invalidCard'] });
        }
        let chosen;
        if (payload.chosen_color) {
            const c = String(payload.chosen_color).toUpperCase();
            if (!['R', 'G', 'B', 'Y'].includes(c)) {
                return client.emit('uno', { success: false, messages: ['ws.uno.chosenColorRequired'] });
            }
            chosen = c;
        }
        const callUno = payload?.call_uno === true;
        await this.runWithRetry(async () => {
            const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds max_players');
            if (!room || room.status !== 'started') {
                return client.emit('uno', { success: false, messages: ['ws.games.roomInactive'] });
            }
            const game = await this.unoModel.findOne({ room_id: new mongoose_2.Types.ObjectId(room_id) });
            if (!game) {
                return client.emit('uno', { success: false, messages: ['ws.games.gameNotFound'] });
            }
            const engine = this.gameToEngine(game);
            let nextState;
            let winnerId;
            try {
                const r = (0, uno_game_logic_1.applyPlay)(engine, player_id, cardIndex, { chosenColor: chosen, callUno });
                nextState = r.state;
                winnerId = r.winnerId;
            }
            catch (e) {
                const key = this.unoReasonToMessageKey(e?.message || '');
                return client.emit('uno', { success: false, messages: [key] });
            }
            this.applyEngineToGame(game, nextState);
            await game.save();
            if (winnerId) {
                await this.finalizeUnoRoundWinner(room_id, room, game, winnerId);
                return;
            }
            await this.broadcastUnoGameState(room_id, room, game);
        });
    }
    async handleCallUno(client, payload) {
        const lang = this.getLang(client);
        if (client.data.isSpectator) {
            return client.emit('uno', {
                success: false,
                messages: ['ws.games.spectatorActionDenied'],
            });
        }
        const room_id = payload?.room_id || client.data.room_id;
        const player_id = client.data.player_id;
        if (!room_id) {
            return client.emit('uno', { success: false, messages: ['ws.invalidMessageFormat'] });
        }
        await this.runWithRetry(async () => {
            const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds max_players');
            if (!room || room.status !== 'started') {
                return client.emit('uno', { success: false, messages: ['ws.games.roomInactive'] });
            }
            const game = await this.unoModel.findOne({ room_id: new mongoose_2.Types.ObjectId(room_id) });
            if (!game) {
                return client.emit('uno', { success: false, messages: ['ws.games.gameNotFound'] });
            }
            const engine = this.gameToEngine(game);
            let nextState;
            try {
                nextState = (0, uno_game_logic_1.applyCallUno)(engine, player_id);
            }
            catch (e) {
                const key = this.unoReasonToMessageKey(e?.message || '');
                return client.emit('uno', { success: false, messages: [key] });
            }
            this.applyEngineToGameNoTurnReset(game, nextState);
            await game.save();
            await this.broadcastUnoGameState(room_id, room, game, { unoCallerId: player_id });
        });
    }
    async handleChallengeUnoMiss(client, payload) {
        const lang = this.getLang(client);
        if (client.data.isSpectator) {
            return client.emit('uno', {
                success: false,
                messages: ['ws.games.spectatorActionDenied'],
            });
        }
        const room_id = payload?.room_id || client.data.room_id;
        const player_id = client.data.player_id;
        const offender_id = payload?.offender_id;
        if (!room_id || !offender_id) {
            return client.emit('uno', { success: false, messages: ['ws.invalidMessageFormat'] });
        }
        await this.runWithRetry(async () => {
            const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds max_players');
            if (!room || room.status !== 'started') {
                return client.emit('uno', { success: false, messages: ['ws.games.roomInactive'] });
            }
            const game = await this.unoModel.findOne({ room_id: new mongoose_2.Types.ObjectId(room_id) });
            if (!game) {
                return client.emit('uno', { success: false, messages: ['ws.games.gameNotFound'] });
            }
            const engine = this.gameToEngine(game);
            let nextState;
            let success;
            try {
                const r = (0, uno_game_logic_1.applyChallengeUnoMiss)(engine, player_id, offender_id);
                nextState = r.state;
                success = r.success;
            }
            catch (e) {
                const key = this.unoReasonToMessageKey(e?.message || '');
                return client.emit('uno', { success: false, messages: [key] });
            }
            if (!success) {
                return client.emit('uno', {
                    success: false,
                    messages: ['ws.uno.challengeFail'],
                });
            }
            this.applyEngineToGameNoTurnReset(game, nextState);
            await game.save();
            const offenderName = await this.getCachedUsername(offender_id);
            const accuserName = await this.getCachedUsername(player_id);
            await this.broadcastUnoGameState(room_id, room, game, {
                challenge: { accuserId: player_id, accuserName, offenderId: offender_id, offenderName },
            });
        });
    }
    async handleStartNextRound(client, payload) {
        const lang = this.getLang(client);
        if (client.data.isSpectator) {
            return client.emit('uno', {
                success: false,
                messages: ['ws.games.spectatorActionDenied'],
            });
        }
        const room_id = payload?.room_id || client.data.room_id;
        const player_id = client.data.player_id;
        if (!room_id) {
            return client.emit('uno', { success: false, messages: ['ws.invalidMessageFormat'] });
        }
        let everyoneReady = false;
        await this.runWithRetry(async () => {
            const game = await this.unoModel.findOne({ room_id: new mongoose_2.Types.ObjectId(room_id) });
            if (!game || !game.between_rounds || game.match_winner_id)
                return;
            const ready = new Set([...(game.players_ready_for_next || []), player_id]);
            const eligible = game.player_ids
                .map((p) => p.toString())
                .filter((id) => !(game.eliminated_players || []).includes(id));
            game.players_ready_for_next = Array.from(ready);
            game.markModified('players_ready_for_next');
            await game.save();
            everyoneReady = eligible.every((id) => ready.has(id));
        });
        if (everyoneReady) {
            await this.startNextRound(room_id, true);
        }
        else {
            const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds max_players');
            const game = await this.unoModel.findOne({ room_id: new mongoose_2.Types.ObjectId(room_id) });
            if (room && game) {
                const winnerEntry = (game.round_history || [])[game.round_history?.length - 1 || 0];
                if (winnerEntry) {
                    await this.broadcastRoundEnd(room_id, room, game, winnerEntry.winnerId, winnerEntry.scoreDealt);
                }
            }
        }
    }
    async handleTakeDrawStack(client, payload) {
        const lang = this.getLang(client);
        if (client.data.isSpectator) {
            return client.emit('uno', {
                success: false,
                messages: ['ws.games.spectatorActionDenied'],
            });
        }
        const room_id = payload?.room_id || client.data.room_id;
        const player_id = client.data.player_id;
        if (!room_id) {
            return client.emit('uno', { success: false, messages: ['ws.invalidMessageFormat'] });
        }
        await this.runWithRetry(async () => {
            const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds max_players');
            if (!room || room.status !== 'started') {
                return client.emit('uno', { success: false, messages: ['ws.games.roomInactive'] });
            }
            const game = await this.unoModel.findOne({ room_id: new mongoose_2.Types.ObjectId(room_id) });
            if (!game) {
                return client.emit('uno', { success: false, messages: ['ws.games.gameNotFound'] });
            }
            const engine = this.gameToEngine(game);
            let nextState;
            try {
                nextState = (0, uno_game_logic_1.applyTakeDrawStack)(engine, player_id).state;
            }
            catch (e) {
                const key = this.unoReasonToMessageKey(e?.message || '');
                return client.emit('uno', { success: false, messages: [key] });
            }
            this.applyEngineToGame(game, nextState);
            await game.save();
            await this.broadcastUnoGameState(room_id, room, game);
        });
    }
    async handleDrawOne(client, payload) {
        const lang = this.getLang(client);
        if (client.data.isSpectator) {
            return client.emit('uno', {
                success: false,
                messages: ['ws.games.spectatorActionDenied'],
            });
        }
        const room_id = payload?.room_id || client.data.room_id;
        const player_id = client.data.player_id;
        if (!room_id) {
            return client.emit('uno', { success: false, messages: ['ws.invalidMessageFormat'] });
        }
        await this.runWithRetry(async () => {
            const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds max_players');
            if (!room || room.status !== 'started') {
                return client.emit('uno', { success: false, messages: ['ws.games.roomInactive'] });
            }
            const game = await this.unoModel.findOne({ room_id: new mongoose_2.Types.ObjectId(room_id) });
            if (!game) {
                return client.emit('uno', { success: false, messages: ['ws.games.gameNotFound'] });
            }
            const engine = this.gameToEngine(game);
            let nextState;
            try {
                nextState = (0, uno_game_logic_1.applyDrawOne)(engine, player_id).state;
            }
            catch (e) {
                const key = this.unoReasonToMessageKey(e?.message || '');
                return client.emit('uno', { success: false, messages: [key] });
            }
            this.applyEngineToGame(game, nextState);
            await game.save();
            await this.broadcastUnoGameState(room_id, room, game);
        });
    }
    async handlePass(client, payload) {
        const lang = this.getLang(client);
        if (client.data.isSpectator) {
            return client.emit('uno', {
                success: false,
                messages: ['ws.games.spectatorActionDenied'],
            });
        }
        const room_id = payload?.room_id || client.data.room_id;
        const player_id = client.data.player_id;
        if (!room_id) {
            return client.emit('uno', { success: false, messages: ['ws.invalidMessageFormat'] });
        }
        await this.runWithRetry(async () => {
            const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds max_players');
            if (!room || room.status !== 'started') {
                return client.emit('uno', { success: false, messages: ['ws.games.roomInactive'] });
            }
            const game = await this.unoModel.findOne({ room_id: new mongoose_2.Types.ObjectId(room_id) });
            if (!game) {
                return client.emit('uno', { success: false, messages: ['ws.games.gameNotFound'] });
            }
            const engine = this.gameToEngine(game);
            let nextState;
            try {
                nextState = (0, uno_game_logic_1.applyPassTurn)(engine, player_id);
            }
            catch (e) {
                const key = this.unoReasonToMessageKey(e?.message || '');
                return client.emit('uno', { success: false, messages: [key] });
            }
            this.applyEngineToGame(game, nextState);
            await game.save();
            await this.broadcastUnoGameState(room_id, room, game);
        });
    }
    gameToEngine(game) {
        const h = this.getHands(game);
        const handsObj = {};
        for (const id of game.player_ids) {
            const sid = id.toString();
            handsObj[sid] = [...(h.get(sid) || [])];
        }
        return {
            playerIds: game.player_ids.map((p) => p.toString()),
            hands: handsObj,
            drawPile: [...game.draw_pile],
            discardPile: [...game.discard_pile],
            currentPlayerIndex: game.current_player_index,
            direction: game.direction,
            currentColor: game.current_color,
            drawStackPending: game.draw_stack_pending ?? 0,
            eliminatedPlayers: [...(game.eliminated_players || [])],
            unoCalled: [...(game.uno_called || [])],
            pendingUnoOffender: game.pending_uno_offender ?? null,
            lastActionPlayerId: game.last_action_player_id ?? null,
        };
    }
    applyEngineToGame(game, eng) {
        this.copyEngineFields(game, eng);
        game.turn_start_time = new Date();
    }
    applyEngineToGameNoTurnReset(game, eng) {
        this.copyEngineFields(game, eng);
    }
    copyEngineFields(game, eng) {
        const m = new Map();
        for (const [k, v] of Object.entries(eng.hands))
            m.set(k, [...v]);
        game.hands = m;
        game.draw_pile = eng.drawPile;
        game.discard_pile = eng.discardPile;
        game.current_player_index = eng.currentPlayerIndex;
        game.direction = eng.direction;
        game.current_color = eng.currentColor;
        game.draw_stack_pending = eng.drawStackPending;
        game.eliminated_players = eng.eliminatedPlayers;
        game.uno_called = eng.unoCalled;
        game.pending_uno_offender = eng.pendingUnoOffender;
        game.last_action_player_id = eng.lastActionPlayerId;
        game.markModified('hands');
        game.markModified('uno_called');
    }
    unoReasonToMessageKey(reason) {
        const map = {
            NOT_YOUR_TURN: 'ws.games.notYourTurn',
            NO_MATCH: 'ws.uno.noMatch',
            MUST_TAKE_STACK: 'ws.uno.mustTakeStack',
            STACK_RESPONSE_REQUIRED: 'ws.uno.mustRespondDrawStack',
            STACK_DRAW2_NOT_ALLOWED: 'ws.uno.stackDraw2NotAllowed',
            WILD4_ILLEGAL_HAS_COLOR: 'ws.uno.wild4Illegal',
            CHOSEN_COLOR_REQUIRED: 'ws.uno.chosenColorRequired',
            INVALID_CARD_INDEX: 'ws.uno.invalidCard',
            ELIMINATED: 'ws.uno.eliminated',
            NO_DRAW_STACK: 'ws.uno.noDrawStack',
            CANNOT_DRAW_WHILE_STACK: 'ws.uno.cannotDrawStack',
            DECK_EMPTY: 'ws.uno.deckEmpty',
            MUST_RESOLVE_STACK: 'ws.uno.mustResolveStack',
            HAS_LEGAL_PLAY: 'ws.uno.hasLegalPlay',
            UNO_CALL_NOT_ALLOWED: 'ws.uno.callNotAllowed',
            INVALID_ACCUSER: 'ws.uno.invalidAccuser',
        };
        return map[reason] || 'ws.games.invalidMove';
    }
    async clearTimersInRoom(room_id) {
        const sockets = await this.server.in(room_id).fetchSockets();
        for (const s of sockets)
            clearTimer(s.id);
    }
    refreshMemberSpectatorFlags(game, sockets) {
        const eliminated = new Set((game.eliminated_players || []).map(String));
        const memberIds = new Set(game.player_ids.map((p) => p.toString()));
        for (const s of sockets) {
            const pid = s.data?.player_id;
            if (!pid || !memberIds.has(pid))
                continue;
            s.data.isSpectator = eliminated.has(pid);
        }
    }
    async broadcastUnoGameState(room_id, room, game, extras, roundStartExtras) {
        const turnRelated = !extras?.unoCallerId && !extras?.challenge;
        if (turnRelated)
            await this.clearTimersInRoom(room_id);
        const timerSec = room.game_id?.turn_timer_seconds ?? 45;
        const idsStr = game.player_ids.map((p) => p.toString());
        const currentTurnId = idsStr[game.current_player_index];
        const currentTurnUsername = await this.getCachedUsername(currentTurnId);
        const sockets = await this.server.in(room_id).fetchSockets();
        this.refreshMemberSpectatorFlags(game, sockets);
        let unoCallerName = '';
        if (extras?.unoCallerId)
            unoCallerName = await this.getCachedUsername(extras.unoCallerId);
        for (const s of sockets) {
            const pid = s.data.player_id;
            const sLang = this.getLang(s);
            const sSpectator = s.data.isSpectator || false;
            const payload = await this.buildUnoPayloadSync(game, room, pid, sSpectator, timerSec, currentTurnUsername);
            const isMyTurn = !sSpectator && pid === currentTurnId;
            let extraData = {};
            let primaryMsg;
            if (extras?.unoCallerId) {
                extraData = { unoCalled: true, unoCallerId: extras.unoCallerId, unoCallerName };
                primaryMsg =
                    pid === extras.unoCallerId ? 'ws.uno.youCalledUno' : 'ws.uno.playerCalledUno';
                if (pid !== extras.unoCallerId) {
                    extraData.unoCallerName = unoCallerName;
                }
            }
            else if (extras?.challenge) {
                extraData = {
                    unoChallenge: {
                        accuserId: extras.challenge.accuserId,
                        accuserName: extras.challenge.accuserName,
                        offenderId: extras.challenge.offenderId,
                        offenderName: extras.challenge.offenderName,
                        penalty: 2,
                    },
                };
                primaryMsg =
                    pid === extras.challenge.offenderId
                        ? 'ws.uno.youWereChallenged'
                        : pid === extras.challenge.accuserId
                            ? 'ws.uno.challengeSuccess'
                            : 'ws.uno.playerChallenged';
            }
            else if (roundStartExtras) {
                extraData = { roundStarted: true, roundNumber: roundStartExtras.roundNumber };
                primaryMsg = roundStartExtras.message;
            }
            else {
                primaryMsg = isMyTurn ? 'ws.games.yourTurn' : 'ws.uno.stateUpdated';
            }
            s.emit('uno', {
                success: true,
                data: { ...payload, ...extraData, gameStarted: true },
                messages: [primaryMsg],
            });
            if (turnRelated && isMyTurn)
                this.startTimer(s, room_id, timerSec);
        }
    }
    async finalizeUnoRoundWinner(room_id, room, game, winnerId) {
        await this.clearTimersInRoom(room_id);
        const idsStr = game.player_ids.map((p) => p.toString());
        const hands = this.getHands(game);
        let scoreDealt = 0;
        for (const id of idsStr) {
            if (id === winnerId)
                continue;
            scoreDealt += (0, uno_game_logic_1.sumHandScore)(hands.get(id) || []);
        }
        const scoresMap = this.getMatchScoresMap(game);
        const newWinnerScore = (scoresMap.get(winnerId) ?? 0) + scoreDealt;
        scoresMap.set(winnerId, newWinnerScore);
        game.match_scores = scoresMap;
        game.markModified('match_scores');
        game.round_history = [
            ...(game.round_history || []),
            { round: game.round_number, winnerId, scoreDealt, endedAt: new Date() },
        ];
        game.markModified('round_history');
        const reachedTarget = newWinnerScore >= game.match_target_score;
        if (reachedTarget) {
            await this.finalizeMatchEnd(room_id, room, game, winnerId);
            return;
        }
        game.between_rounds = true;
        game.between_rounds_processing = false;
        game.eliminated_players = [];
        game.markModified('eliminated_players');
        const deadline = new Date(Date.now() + BETWEEN_ROUNDS_SECONDS * 1000);
        game.next_round_starts_at = deadline;
        game.players_ready_for_next = [];
        await game.save();
        this.logger.log(`event=uno_round_end room=${room_id} winner=${winnerId} score=${scoreDealt} round=${game.round_number} next_deadline=${deadline.toISOString()}`);
        await this.broadcastRoundEnd(room_id, room, game, winnerId, scoreDealt);
    }
    async finalizeMatchEnd(room_id, room, game, winnerId) {
        this.logger.log(`event=uno_match_end room=${room_id} winner=${winnerId} round=${game.round_number}`);
        room.status = 'finished';
        room.winner = new mongoose_2.Types.ObjectId(winnerId);
        room.winner_reason = 'win';
        room.finished_at = new Date();
        const grossPayout = (0, game_prize_util_1.winnerGrossPayout)(room.bet_amount, room.house_edge, room.players.length);
        await this.userModel.updateOne({ _id: winnerId }, { $inc: { balance: grossPayout } });
        game.match_winner_id = winnerId;
        game.between_rounds = false;
        game.next_round_starts_at = null;
        await game.save();
        await room.save();
        const gameId = room.game_id?._id?.toString() || room.game_id?.toString();
        if (gameId)
            this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
        const timerSec = room.game_id?.turn_timer_seconds ?? 45;
        const currentTurnUsername = await this.getCachedUsername(winnerId);
        const sockets = await this.server.in(room_id).fetchSockets();
        const displayPrize = (0, game_prize_util_1.winnerDisplayedPrize)(room.bet_amount, room.house_edge, room.players.length);
        for (const s of sockets) {
            const pid = s.data.player_id;
            const sLang = this.getLang(s);
            const sSpectator = s.data.isSpectator || false;
            const payload = await this.buildUnoPayloadSync(game, room, pid, sSpectator, timerSec, currentTurnUsername);
            const isWinner = !sSpectator && pid === winnerId;
            s.emit('uno', {
                success: true,
                data: {
                    ...payload,
                    gameEnded: true,
                    matchEnded: true,
                    youWon: isWinner,
                    winner: winnerId,
                    prize: isWinner ? displayPrize : 0,
                    outcome: 'win',
                },
                messages: [isWinner ? 'ws.games.win' : 'ws.uno.matchWinner'],
            });
        }
    }
    async broadcastRoundEnd(room_id, room, game, winnerId, scoreDealt) {
        const winnerName = await this.getCachedUsername(winnerId);
        const timerSec = room.game_id?.turn_timer_seconds ?? 45;
        const sockets = await this.server.in(room_id).fetchSockets();
        this.refreshMemberSpectatorFlags(game, sockets);
        for (const s of sockets) {
            const pid = s.data.player_id;
            const sLang = this.getLang(s);
            const sSpectator = s.data.isSpectator || false;
            const payload = await this.buildUnoPayloadSync(game, room, pid, sSpectator, timerSec, winnerName);
            const wonRound = !sSpectator && pid === winnerId;
            s.emit('uno', {
                success: true,
                data: {
                    ...payload,
                    roundEnded: true,
                    roundWinnerId: winnerId,
                    roundWinnerUsername: winnerName,
                    roundScoreDealt: scoreDealt,
                },
                messages: [wonRound ? 'ws.uno.youWonRound' : 'ws.uno.playerWonRound'],
            });
        }
    }
    async startNextRound(room_id, triggeredByReady) {
        const game = await this.unoModel.findOneAndUpdate({
            room_id: new mongoose_2.Types.ObjectId(room_id),
            between_rounds: true,
            between_rounds_processing: false,
            match_winner_id: null,
        }, { $set: { between_rounds_processing: true } }, { returnDocument: 'after' });
        if (!game) {
            return;
        }
        try {
            const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds max_players');
            if (!room || room.status !== 'started') {
                await this.unoModel.updateOne({ _id: game._id }, { $set: { between_rounds_processing: false } });
                return;
            }
            const playerIdStrs = game.player_ids.map((p) => p.toString());
            let deal;
            try {
                deal = (0, uno_game_logic_1.dealUnoInitialState)(playerIdStrs);
            }
            catch (e) {
                this.logger.error(`[UNO] Re-deal failed | room=${room_id}`, e);
                await this.unoModel.updateOne({ _id: game._id }, { $set: { between_rounds_processing: false } });
                return;
            }
            const handsMap = new Map();
            for (const id of playerIdStrs)
                handsMap.set(id, [...(deal.hands[id] || [])]);
            game.hands = handsMap;
            game.draw_pile = deal.drawPile;
            game.discard_pile = deal.discardPile;
            game.current_player_index = 0;
            game.direction = 1;
            game.current_color = deal.currentColor;
            game.draw_stack_pending = 0;
            game.eliminated_players = [];
            game.uno_called = [];
            game.pending_uno_offender = null;
            game.last_action_player_id = null;
            game.between_rounds = false;
            game.between_rounds_processing = false;
            game.next_round_starts_at = null;
            game.players_ready_for_next = [];
            game.round_number += 1;
            game.turn_start_time = new Date();
            game.markModified('hands');
            game.markModified('eliminated_players');
            await game.save();
            this.logger.log(`event=uno_round_auto_start room=${room_id} round=${game.round_number} trigger=${triggeredByReady ? 'ready' : 'timer'}`);
            await this.broadcastUnoGameState(room_id, room, game, undefined, {
                message: triggeredByReady ? 'ws.uno.nextRoundStartedReady' : 'ws.uno.nextRoundStarted',
                roundNumber: game.round_number,
            });
        }
        catch (err) {
            this.logger.error(`[UNO] startNextRound failed | room=${room_id}`, err);
            await this.unoModel
                .updateOne({ _id: game._id }, { $set: { between_rounds_processing: false } })
                .catch(() => { });
        }
    }
    async processBetweenRoundsTimeouts() {
        let expired = [];
        try {
            expired = await this.unoModel
                .find({
                between_rounds: true,
                between_rounds_processing: false,
                next_round_starts_at: { $lte: new Date() },
                match_winner_id: null,
            })
                .select('room_id')
                .lean();
        }
        catch (err) {
            this.logger.error('[UNO] Scheduler poll failed', err);
            return;
        }
        if (expired.length === 0)
            return;
        for (const g of expired) {
            try {
                await this.startNextRound(g.room_id.toString(), false);
            }
            catch (err) {
                this.logger.error(`[UNO] Scheduler dispatch failed | room=${g.room_id}`, err);
            }
        }
    }
    getMatchScoresMap(game) {
        if (game.match_scores instanceof Map)
            return new Map(game.match_scores);
        return new Map(Object.entries(game.match_scores || {}).map(([k, v]) => [k, Number(v) || 0]));
    }
    async emitUnoStateToClient(client, room, game, timerSec, lang) {
        const player_id = client.data.player_id;
        const isSpectator = client.data.isSpectator || false;
        const idsStr = game.player_ids.map((p) => p.toString());
        const currentTurnId = idsStr[game.current_player_index];
        const currentTurnUsername = await this.getCachedUsername(currentTurnId);
        let remainingTurnSecs = timerSec;
        if (game.turn_start_time && !game.between_rounds && !game.match_winner_id) {
            const elapsed = (Date.now() - new Date(game.turn_start_time).getTime()) / 1000;
            remainingTurnSecs = Math.max(5, Math.ceil(timerSec - elapsed));
        }
        const payload = await this.buildUnoPayloadSync(game, room, player_id, isSpectator, remainingTurnSecs, currentTurnUsername);
        let messages = [];
        let extra = {};
        if (game.between_rounds && !game.match_winner_id) {
            const lastRound = (game.round_history || [])[game.round_history?.length - 1 || 0];
            if (lastRound) {
                const winnerName = await this.getCachedUsername(lastRound.winnerId);
                extra = {
                    roundEnded: true,
                    roundWinnerId: lastRound.winnerId,
                    roundWinnerUsername: winnerName,
                    roundScoreDealt: lastRound.scoreDealt,
                };
                messages = ['ws.uno.playerWonRound'];
            }
        }
        else if (game.match_winner_id) {
            const winnerName = await this.getCachedUsername(game.match_winner_id);
            extra = {
                gameEnded: true,
                matchEnded: true,
                winner: game.match_winner_id,
                youWon: !isSpectator && player_id === game.match_winner_id,
                outcome: 'win',
            };
            messages = ['ws.uno.matchWinner'];
        }
        client.emit('uno', { success: true, data: { ...payload, ...extra }, messages });
        const isMyTurn = !isSpectator && player_id === currentTurnId;
        if (isMyTurn && !game.between_rounds && !game.match_winner_id) {
            this.startTimer(client, (room?._id ?? room?.id ?? '').toString() || client.data.room_id, remainingTurnSecs);
        }
    }
    async buildUnoPayloadSync(game, room, viewerPlayerId, isSpectator, timerSec, currentTurnUsername) {
        const hands = this.getHands(game);
        const idsStr = game.player_ids.map((p) => p.toString());
        const handCount = {};
        for (const id of idsStr) {
            handCount[id] = (hands.get(id) || []).length;
        }
        const topDiscard = game.discard_pile?.length ? game.discard_pile[game.discard_pile.length - 1] : null;
        const currentTurnId = idsStr[game.current_player_index];
        const yourTurn = !isSpectator && currentTurnId === viewerPlayerId;
        const usernames = {};
        for (const id of idsStr) {
            usernames[id] = await this.getCachedUsername(id);
        }
        const lastActionId = game.last_action_player_id ?? null;
        const lastActionUsername = lastActionId ? await this.getCachedUsername(lastActionId) : null;
        const scoresMap = this.getMatchScoresMap(game);
        const matchScores = {};
        for (const id of idsStr)
            matchScores[id] = scoresMap.get(id) ?? 0;
        return {
            hand: isSpectator ? [] : hands.get(viewerPlayerId) || [],
            handCount,
            topDiscard,
            discardCount: game.discard_pile?.length ?? 0,
            drawPileCount: game.draw_pile?.length ?? 0,
            currentColor: game.current_color,
            direction: game.direction,
            currentPlayerIndex: game.current_player_index,
            currentTurnPlayerId: currentTurnId,
            currentTurnUsername,
            yourTurn,
            turnTimerSeconds: timerSec,
            drawStackPending: game.draw_stack_pending ?? 0,
            playerOrder: idsStr,
            usernames,
            waitingForOpponent: false,
            gameStarted: true,
            isSpectator,
            eliminatedPlayers: game.eliminated_players || [],
            unoCalled: game.uno_called || [],
            pendingUnoOffender: game.pending_uno_offender ?? null,
            lastActionPlayerId: lastActionId,
            lastActionUsername,
            matchScores,
            roundNumber: game.round_number ?? 1,
            matchTargetScore: game.match_target_score ?? uno_game_constants_1.UNO_MATCH_TARGET_DEFAULT,
            matchWinnerId: game.match_winner_id ?? null,
            betweenRounds: !!game.between_rounds,
            nextRoundStartsAt: game.next_round_starts_at ? new Date(game.next_round_starts_at).toISOString() : null,
            playersReadyForNext: game.players_ready_for_next || [],
            roundHistory: (game.round_history || []).map((r) => ({
                round: r.round,
                winnerId: r.winnerId,
                scoreDealt: r.scoreDealt,
                endedAt: r.endedAt ? new Date(r.endedAt).toISOString() : null,
            })),
        };
    }
    startTimer(socket, room_id, seconds) {
        const player_id = socket.data?.player_id;
        if (!player_id)
            return;
        clearTimer(socket.id);
        const t = setTimeout(async () => {
            const game = await this.unoModel.findOne({ room_id: new mongoose_2.Types.ObjectId(room_id) });
            if (!game)
                return;
            const room = await this.roomModel.findById(room_id);
            if (!room || room.status !== 'started')
                return;
            const idsStr = game.player_ids.map((p) => p.toString());
            if (idsStr[game.current_player_index] !== player_id)
                return;
            const eliminated = game.eliminated_players || [];
            const remainingAfterTimeout = (0, uno_game_logic_1.activePlayerCount)(idsStr, [...eliminated, player_id]);
            const matchEnds = remainingAfterTimeout <= 1;
            const lang = this.getLang(socket);
            socket.emit('uno', {
                success: true,
                data: {
                    gameEnded: matchEnds,
                    matchEnded: matchEnds,
                    outcome: matchEnds ? 'timeout_loss' : undefined,
                    eliminatedFromRound: !matchEnds,
                    youWon: false,
                    reason: 'timeout',
                    isSpectator: false,
                },
                messages: ['ws.domino.timeout'],
            });
            socket.data.eliminationReason = 'timeout';
            await this.eliminatePlayer(room_id, player_id, 'timeout');
            if (matchEnds) {
                socket.leave(room_id);
                socket.disconnect(true);
            }
            else {
                socket.data.isSpectator = true;
            }
        }, seconds * 1000);
        turnTimers.set(socket.id, t);
    }
    async eliminatePlayer(room_id, player_id, reason) {
        await this.runWithRetry(async () => {
            await this.redis.del(`grace_period:uno:${player_id}`);
            const game = await this.unoModel.findOne({ room_id: new mongoose_2.Types.ObjectId(room_id) });
            if (!game)
                return;
            const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds');
            if (!room || room.status !== 'started')
                return;
            const idsStr = game.player_ids.map((p) => p.toString());
            const eliminated = game.eliminated_players || [];
            if (eliminated.includes(player_id))
                return;
            const hands = this.getHands(game);
            const hand = hands.get(player_id) || [];
            if (hand.length > 0) {
                game.draw_pile = [...game.draw_pile, ...hand];
                hands.set(player_id, []);
            }
            const newEliminated = [...eliminated, player_id];
            game.eliminated_players = newEliminated;
            if (idsStr[game.current_player_index] === player_id) {
                game.current_player_index = (0, uno_game_logic_1.getNextUnoPlayerIndex)(game.current_player_index, idsStr, newEliminated, game.direction);
                game.turn_start_time = new Date();
            }
            const remaining = (0, uno_game_logic_1.activePlayerCount)(idsStr, newEliminated);
            let winnerId;
            if (remaining <= 1) {
                winnerId = idsStr.find((id) => !newEliminated.includes(id));
                room.status = 'finished';
                room.winner_reason = reason;
                room.finished_at = new Date();
                if (winnerId) {
                    room.winner = new mongoose_2.Types.ObjectId(winnerId);
                    const grossPayout = (0, game_prize_util_1.winnerGrossPayout)(room.bet_amount, room.house_edge, room.players.length);
                    await this.userModel.updateOne({ _id: winnerId }, { $inc: { balance: grossPayout } });
                    game.match_winner_id = winnerId;
                }
                game.between_rounds = false;
                game.between_rounds_processing = false;
                game.next_round_starts_at = null;
                await room.save();
                const gameId = room.game_id?._id?.toString() || room.game_id?.toString();
                if (gameId)
                    this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
                this.logger.log(`event=uno_match_end_forfeit room=${room_id} winner=${winnerId ?? 'none'} reason=${reason}`);
            }
            else {
                await room.save();
            }
            game.hands = hands;
            game.markModified('hands');
            game.markModified('draw_pile');
            game.markModified('eliminated_players');
            await game.save();
            const sockets = await this.server.in(room_id).fetchSockets();
            const nextId = idsStr[game.current_player_index];
            const nextUsername = await this.getCachedUsername(nextId);
            const timerSec = room.game_id?.turn_timer_seconds ?? 45;
            const finished = remaining <= 1;
            for (const s of sockets) {
                const pid = s.data.player_id;
                const sLang = this.getLang(s);
                const sSpectator = s.data.isSpectator || false;
                const payload = await this.buildUnoPayloadSync(game, room, pid, sSpectator, timerSec, nextUsername);
                const isWinner = !sSpectator && finished && winnerId && pid === winnerId;
                const prize = isWinner && winnerId
                    ? (0, game_prize_util_1.winnerDisplayedPrize)(room.bet_amount, room.house_edge, room.players.length)
                    : 0;
                let msg;
                if (finished) {
                    msg = isWinner ? 'ws.games.win' : 'ws.games.gameOver';
                }
                else {
                    msg = 'ws.domino.playerEliminated';
                }
                s.emit('uno', {
                    success: true,
                    data: {
                        ...payload,
                        gameEnded: finished,
                        matchEnded: finished,
                        youWon: isWinner,
                        winner: finished && winnerId ? winnerId : undefined,
                        prize,
                        eliminationReason: reason,
                    },
                    messages: [msg],
                });
                if (!finished && !sSpectator && pid === nextId) {
                    this.startTimer(s, room_id, timerSec);
                }
            }
        });
    }
};
exports.UnoGateway = UnoGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], UnoGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('join'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], UnoGateway.prototype, "handleJoin", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('sync'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], UnoGateway.prototype, "handleSync", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('play_card'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], UnoGateway.prototype, "handlePlayCard", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('call_uno'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], UnoGateway.prototype, "handleCallUno", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('challenge_uno_miss'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], UnoGateway.prototype, "handleChallengeUnoMiss", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('start_next_round'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], UnoGateway.prototype, "handleStartNextRound", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('take_draw_stack'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], UnoGateway.prototype, "handleTakeDrawStack", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('draw_one'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], UnoGateway.prototype, "handleDrawOne", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('pass'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], UnoGateway.prototype, "handlePass", null);
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_SECOND),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], UnoGateway.prototype, "processBetweenRoundsTimeouts", null);
exports.UnoGateway = UnoGateway = UnoGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({ namespace: '/uno', cors: { origin: '*', credentials: true } }),
    __param(0, (0, mongoose_1.InjectModel)(uno_game_schema_1.UnoGame.name)),
    __param(1, (0, mongoose_1.InjectModel)('Room')),
    __param(2, (0, mongoose_1.InjectModel)('User')),
    __param(5, (0, common_1.Inject)(redis_module_1.REDIS_CLIENT)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        config_1.ConfigService,
        rooms_gateway_1.RoomsGateway, Object, i18n_service_1.I18nService,
        grace_period_service_1.GracePeriodService])
], UnoGateway);
//# sourceMappingURL=uno.gateway.js.map