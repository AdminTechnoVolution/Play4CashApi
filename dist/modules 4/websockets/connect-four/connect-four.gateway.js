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
var ConnectFourGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectFourGateway = void 0;
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
const connect_four_game_schema_1 = require("./schemas/connect-four-game.schema");
const i18n_service_1 = require("../../../common/i18n/i18n.service");
const game_prize_util_1 = require("../../../common/utils/game-prize.util");
const connect_four_game_logic_1 = require("./connect-four-game.logic");
const tournament_match_service_1 = require("../../tournament/services/tournament-match.service");
const EVENT = 'connect-four';
const turnTimers = new Map();
const clearTimer = (id) => {
    const t = turnTimers.get(id);
    if (t) {
        clearTimeout(t);
        turnTimers.delete(id);
    }
};
let ConnectFourGateway = ConnectFourGateway_1 = class ConnectFourGateway {
    gameModel;
    roomModel;
    userModel;
    config;
    roomsGateway;
    redis;
    i18n;
    grace;
    tournamentMatchService;
    server;
    logger = new common_1.Logger(ConnectFourGateway_1.name);
    usernameCache = new Map();
    constructor(gameModel, roomModel, userModel, config, roomsGateway, redis, i18n, grace, tournamentMatchService) {
        this.gameModel = gameModel;
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
        this.grace.registerHandler('connect-four', (playerId, roomId) => this.executeForfeit(roomId, playerId));
    }
    afterInit(server) {
        (0, ws_auth_middleware_1.applyWsAuth)(server, this.config, this.redis);
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
    emit(client, success, data, messages) {
        client.emit(EVENT, { success, data, messages });
    }
    async buildPublicState(room, game, viewerPlayerNum, viewerIsSpectator) {
        const p1Id = room.players[0]?.playerId?.toString();
        const p2Id = room.players[1]?.playerId?.toString();
        const player1 = p1Id ? await this.getCachedUsername(p1Id) : 'Unknown';
        const player2 = p2Id ? await this.getCachedUsername(p2Id) : 'Unknown';
        const board = game?.board ? (0, connect_four_game_logic_1.coerceConnectFourBoard)(game.board) : (0, connect_four_game_logic_1.createEmptyBoard)();
        const currentPlayer = game?.current_player ?? 1;
        const currentTurnUserId = currentPlayer === 1 ? p1Id ?? null : p2Id ?? null;
        let winnerUserId = null;
        if (room.status === 'finished' && room.winner) {
            winnerUserId = room.winner.toString();
        }
        const totalTimer = room.game_id?.turn_timer_seconds ?? 30;
        let turnTimerSeconds = totalTimer;
        if (game?.turn_start_time && room.status === 'started') {
            const elapsed = (Date.now() - game.turn_start_time.getTime()) / 1000;
            turnTimerSeconds = Math.max(5, Math.ceil(totalTimer - elapsed));
        }
        const yourColor = viewerPlayerNum === 1 ? 'R' : viewerPlayerNum === 2 ? 'Y' : null;
        const lastMove = this.formatLastMoveFromGame(game);
        return {
            roomId: room._id.toString(),
            status: room.status,
            board,
            players: [
                { userId: p1Id, username: player1, color: 'R', connected: true },
                { userId: p2Id, username: player2, color: 'Y', connected: true },
            ],
            currentTurnUserId,
            currentPlayer,
            currentTurnUsername: currentPlayer === 1 ? player1 : player2,
            turnOf: currentPlayer === 1 ? player1 : player2,
            winnerUserId,
            winningCells: game?.winning_cells ?? [],
            isDraw: room.status === 'finished' && !room.winner && room.winner_reason === 'draw',
            yourColor,
            yourTurn: !viewerIsSpectator &&
                viewerPlayerNum === currentPlayer &&
                room.status === 'started',
            turnTimerSeconds,
            gameStarted: room.status === 'started' || room.status === 'finished',
            isSpectator: viewerIsSpectator,
            player1,
            player2,
            winnerReason: room.winner_reason ?? null,
            spectatorsCount: room.spectators?.length ?? 0,
            moveRevision: game?.move_revision ?? 0,
            ...(lastMove ? { lastMove } : {}),
        };
    }
    formatLastMoveFromGame(game) {
        const lm = game?.last_move;
        if (!lm || (lm.color !== 'R' && lm.color !== 'Y'))
            return null;
        return {
            userId: String(lm.userId),
            row: Number(lm.row),
            col: Number(lm.col),
            color: lm.color,
            at: lm.at instanceof Date ? lm.at.toISOString() : String(lm.at ?? ''),
        };
    }
    handleConnection(client) {
        this.logger.log(`[ConnectFour] Connected: ${client.id}`);
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
            client.to(room_id).emit(EVENT, {
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
                await this.roomModel.findOneAndDelete({ _id: room_id, players: { $size: 0 } });
                this.server.serverSideEmit?.('roomDeleted', { id: room_id });
                if (gameIdForLobby) {
                    this.roomsGateway.broadcastRoomUpdate(gameIdForLobby, 'roomDeleted', { id: room_id });
                }
            }
            else {
                const sLang = this.getLang(client);
                client.to(room_id).emit(EVENT, {
                    success: true,
                    messages: [this.i18n.translate('ws.games.opponentLeft', sLang)],
                    data: { opponentLeft: true, waitingForOpponent: true },
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
            const game = await this.gameModel.findOne({ room_id: roomObjId });
            let remainingTurnSecs = 0;
            if (game?.turn_start_time) {
                const limit = (room.game_id?.turn_timer_seconds || 30) * 1000;
                remainingTurnSecs = Math.ceil((limit - (Date.now() - game.turn_start_time.getTime())) / 1000);
            }
            await this.grace.start('connect-four', player_id, room_id, Math.max(60, remainingTurnSecs));
        }
    }
    async executeForfeit(room_id, player_id) {
        const room = await this.roomModel
            .findOne({ _id: new mongoose_2.Types.ObjectId(room_id), status: 'started' })
            .populate('game_id', 'turn_timer_seconds');
        if (!room)
            return;
        const winner_id = room.players.find((p) => p.playerId.toString() !== player_id)?.playerId;
        if (!winner_id)
            return;
        room.status = 'finished';
        room.winner = winner_id;
        room.winner_reason = 'forfeit';
        room.finished_at = new Date();
        await room.save();
        const grossPayout = (0, game_prize_util_1.winnerGrossPayout)(room.bet_amount, room.house_edge, room.players.length);
        await this.userModel.findByIdAndUpdate(winner_id, { $inc: { balance: grossPayout } });
        const winnerUsername = await this.getCachedUsername(winner_id.toString());
        const game = await this.gameModel.findOne({ room_id: new mongoose_2.Types.ObjectId(room_id) });
        const sockets = await this.server.in(room_id).fetchSockets();
        for (const s of sockets) {
            const sIsSpectator = s.data.isSpectator || false;
            const sPNum = this.resolvePlayerNum(s, room);
            if (sPNum)
                s.data.playerNum = sPNum;
            const sLang = this.getLang(s);
            const sState = await this.buildPublicState(room, game, sIsSpectator ? null : sPNum, sIsSpectator);
            const isWinner = !sIsSpectator && sPNum > 0 && room.players[sPNum - 1]?.playerId?.toString() === winner_id.toString();
            s.emit(EVENT, {
                success: false,
                messages: sIsSpectator
                    ? [this.i18n.translate('ws.games.winsForfeit', sLang, { username: winnerUsername })]
                    : [this.i18n.translate('ws.games.playerDisconnected', sLang)],
                data: {
                    ...sState,
                    outcome: 'opponent_disconnected',
                    gameEnded: true,
                    winner: sIsSpectator ? winnerUsername : winner_id.toString(),
                    youWon: isWinner,
                    isSpectator: sIsSpectator,
                },
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
        await this.grace.cancel('connect-four', player_id);
        if (!room_id) {
            return this.emit(client, false, {}, [this.i18n.translate('ws.invalidMessageFormat', lang)]);
        }
        const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds');
        if (!room) {
            return this.emit(client, false, {}, [this.i18n.translate('ws.games.gameNotFound', lang)]);
        }
        if (room.status === 'finished') {
            return this.emit(client, false, {}, [this.i18n.translate('ws.games.roomInactive', lang)]);
        }
        const isMember = room.players.some((p) => p.playerId.toString() === player_id);
        const isSpectator = room.spectators?.some((id) => id.toString() === player_id);
        if (!isMember && !isSpectator) {
            return this.emit(client, false, {}, [this.i18n.translate('ws.games.notInRoom', lang)]);
        }
        await client.join(room_id);
        client.data.room_id = room_id;
        client.data.isSpectator = !isMember;
        this.logger.log(`event=connect_four_join room=${room_id} sid=${client.id} player=${player_id} status=${room.status}`);
        const game = await this.gameModel.findOne({ room_id: new mongoose_2.Types.ObjectId(room_id) });
        if (client.data.isSpectator) {
            if (room.status === 'started' && game) {
                const state = await this.buildPublicState(room, game, null, true);
                client.to(room_id).emit(EVENT, {
                    success: true,
                    data: { spectatorsCount: room.spectators?.length ?? 0 },
                    messages: [],
                });
                return this.emit(client, true, {
                    ...state,
                    waitingForOpponent: false,
                    gameStarted: true,
                    spectatorsCount: room.spectators?.length ?? 0,
                }, []);
            }
            const lobbyState = await this.buildPublicState(room, game, null, true);
            return this.emit(client, true, {
                ...lobbyState,
                waitingForOpponent: true,
                spectatorsCount: room.spectators?.length ?? 0,
            }, [this.i18n.translate('ws.games.waitingOpponent', lang)]);
        }
        const playerIndex = room.players.findIndex((p) => p.playerId.toString() === player_id);
        const playerNum = playerIndex + 1;
        client.data.playerNum = playerNum;
        if (room.status === 'started' && game) {
            const state = await this.buildPublicState(room, game, playerNum, false);
            const isMyTurn = game.current_player === playerNum;
            if (isMyTurn) {
                this.startTimer(client, room_id, state.turnTimerSeconds);
            }
            return this.emit(client, true, {
                ...state,
                waitingForOpponent: false,
                gameStarted: true,
            }, []);
        }
        this.emit(client, true, {
            waitingForOpponent: true,
            isSpectator: false,
            playersJoined: await this.countPlayerSockets(room_id),
            maxPlayers: 2,
        }, [this.i18n.translate('ws.games.waitingOpponent', lang)]);
        const socketsInRoom = await this.server.in(room_id).fetchSockets();
        if (socketsInRoom.length > 1) {
            const username = await this.getCachedUsername(player_id);
            client.to(room_id).emit(EVENT, {
                success: true,
                messages: [this.i18n.translate('ws.games.opponentJoined', lang, { username })],
                data: { opponentJoined: true, opponentName: username },
            });
        }
        const maxPlayers = room.player_limit || room.game_id?.max_players || 2;
        if (socketsInRoom.length >= maxPlayers &&
            room.status === 'waiting' &&
            room.players.length >= maxPlayers &&
            room.players[0]?.playerId &&
            room.players[1]?.playerId) {
            await this.tryStartConnectFourGame(room_id, lang);
        }
    }
    resolvePlayerNum(socket, room) {
        let pNum = Number(socket?.data?.playerNum) || 0;
        if (pNum === 1 || pNum === 2)
            return pNum;
        const pid = socket?.data?.player_id;
        if (!pid)
            return 0;
        const idx = room.players.findIndex((p) => p.playerId.toString() === pid);
        if (idx === 0)
            return 1;
        if (idx === 1)
            return 2;
        return 0;
    }
    async countPlayerSockets(room_id) {
        const sockets = await this.server.in(room_id).fetchSockets();
        return sockets.filter((s) => !s.data?.isSpectator).length;
    }
    async tryStartConnectFourGame(room_id, lang) {
        const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds');
        if (!room || room.status !== 'waiting')
            return;
        if (room.players.length < 2 || !room.players[0]?.playerId || !room.players[1]?.playerId) {
            return;
        }
        const socketsInRoom = await this.server.in(room_id).fetchSockets();
        const playerSockets = socketsInRoom.filter((s) => !s.data?.isSpectator);
        if (playerSockets.length < 2)
            return;
        const started = await this.roomModel.findOneAndUpdate({ _id: room_id, status: 'waiting' }, { $set: { status: 'started', turn_start_time: new Date() } }, { returnDocument: 'after' });
        if (!started)
            return;
        const [p1id, p2id] = [room.players[0].playerId, room.players[1].playerId];
        const paid = [];
        const compensate = async (errKey, reason) => {
            this.logger.error(`event=connect_four_start_failed room=${room_id} reason=${reason}`);
            for (const pid of paid) {
                await this.userModel
                    .updateOne({ _id: pid }, { $inc: { balance: room.bet_amount } })
                    .catch((e) => this.logger.error(`[ConnectFour] Refund failed | player=${pid}`, e));
            }
            await this.gameModel
                .deleteOne({ room_id: new mongoose_2.Types.ObjectId(room_id) })
                .catch((e) => this.logger.error(`[ConnectFour] Game cleanup failed | room=${room_id}`, e));
            await this.roomModel
                .findByIdAndUpdate(room_id, { $set: { status: 'waiting' } })
                .catch((e) => this.logger.error(`[ConnectFour] Room status reset failed | room=${room_id}`, e));
            this.server.to(room_id).emit(EVENT, {
                success: false,
                messages: [this.i18n.translate(errKey, lang)],
            });
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
        const board = (0, connect_four_game_logic_1.createEmptyBoard)();
        try {
            await this.gameModel.create({
                room_id: new mongoose_2.Types.ObjectId(room_id),
                player1_id: p1id,
                player2_id: p2id,
                board,
                current_player: 1,
                winning_cells: [],
                turn_start_time: new Date(),
                move_revision: 0,
            });
        }
        catch (e) {
            this.logger.error(`[ConnectFour] Game create failed | room=${room_id}`, e);
            await compensate('ws.games.matchmakingError', 'game_create_failed');
            return;
        }
        const timerSeconds = room.game_id?.turn_timer_seconds ?? 30;
        const freshGame = await this.gameModel.findOne({ room_id: new mongoose_2.Types.ObjectId(room_id) });
        const populatedRoom = await this.roomModel.findById(room_id).populate('game_id');
        const freshPlayerSockets = (await this.server.in(room_id).fetchSockets()).filter((s) => !s.data?.isSpectator);
        this.logger.log(`event=connect_four_start room=${room_id} sockets=${freshPlayerSockets.length}`);
        for (const s of freshPlayerSockets) {
            try {
                const sPNum = this.resolvePlayerNum(s, room);
                if (sPNum)
                    s.data.playerNum = sPNum;
                const sIsSpectator = s.data.isSpectator || false;
                const isFirst = sPNum === 1;
                const sLang = this.getLang(s);
                const sState = await this.buildPublicState(populatedRoom, freshGame, sIsSpectator ? null : sPNum, sIsSpectator);
                s.emit(EVENT, {
                    success: true,
                    data: {
                        ...sState,
                        waitingForOpponent: false,
                        gameStarted: true,
                    },
                    messages: sIsSpectator
                        ? [this.i18n.translate('ws.games.gameStarted', sLang)]
                        : [
                            isFirst
                                ? this.i18n.translate('ws.games.yourTurn', sLang)
                                : this.i18n.translate('ws.games.waitingOpponent', sLang),
                        ],
                });
                if (isFirst && !sIsSpectator) {
                    this.startTimer(s, room_id, timerSeconds);
                }
            }
            catch (emitErr) {
                this.logger.error(`event=connect_four_start_emit_failed room=${room_id} sid=${s.id}`, emitErr);
            }
        }
        const gId = room.game_id?._id?.toString() || room.game_id?.toString();
        const populated = await this.roomModel
            .findById(room_id)
            .populate('game_id', '-created_at')
            .populate('players.playerId', 'username')
            .lean();
        if (gId)
            this.roomsGateway.broadcastRoomUpdate(gId, 'roomUpdated', populated);
    }
    async handleGetState(client, payload) {
        const lang = this.getLang(client);
        const room_id = payload?.room_id || client.data.room_id;
        if (!room_id) {
            return this.emit(client, false, {}, [this.i18n.translate('ws.invalidMessageFormat', lang)]);
        }
        const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds');
        if (!room) {
            return this.emit(client, false, {}, [this.i18n.translate('ws.games.gameNotFound', lang)]);
        }
        const game = await this.gameModel.findOne({ room_id: new mongoose_2.Types.ObjectId(room_id) });
        const playerNum = this.resolvePlayerNum(client, room) || client.data.playerNum || 0;
        if (playerNum)
            client.data.playerNum = playerNum;
        const state = await this.buildPublicState(room, game, client.data.isSpectator ? null : playerNum, !!client.data.isSpectator);
        this.emit(client, true, { gameState: state }, []);
    }
    async finalizeConnectFourMatch(room_id, game, outcome) {
        const winnerId = outcome.kind === 'win'
            ? outcome.winnerNum === 1
                ? game.player1_id
                : game.player2_id
            : null;
        const finishUpdate = {
            status: 'finished',
            finished_at: new Date(),
            winner_reason: outcome.kind === 'draw' ? 'draw' : 'win',
            winner: winnerId ?? undefined,
        };
        let finishedRoom = await this.roomModel.findOneAndUpdate({ _id: room_id, status: 'started' }, { $set: finishUpdate }, { returnDocument: 'after' });
        if (!finishedRoom) {
            const alreadyFinished = await this.roomModel.findOne({
                _id: room_id,
                status: 'finished',
            });
            if (alreadyFinished)
                return alreadyFinished;
        }
        if (!finishedRoom)
            return null;
        const isTournament = finishedRoom.source === 'tournament' && finishedRoom.tournament_match_id;
        if (isTournament && this.tournamentMatchService) {
            const loserId = outcome.kind === 'win' && winnerId
                ? game.player1_id.toString() === winnerId.toString()
                    ? game.player2_id.toString()
                    : game.player1_id.toString()
                : undefined;
            if (outcome.kind === 'win' && winnerId) {
                await this.tournamentMatchService.completeFromGameRoom(finishedRoom, {
                    winnerId: winnerId.toString(),
                    loserId,
                    reason: 'normal',
                });
            }
        }
        else if (outcome.kind === 'draw') {
            await this.userModel.updateOne({ _id: game.player1_id }, { $inc: { balance: finishedRoom.bet_amount } });
            await this.userModel.updateOne({ _id: game.player2_id }, { $inc: { balance: finishedRoom.bet_amount } });
        }
        else if (!isTournament) {
            const grossPayout = (0, game_prize_util_1.winnerGrossPayout)(finishedRoom.bet_amount, finishedRoom.house_edge, finishedRoom.players.length);
            await this.userModel.updateOne({ _id: winnerId }, { $inc: { balance: grossPayout } });
        }
        const gameId = finishedRoom.game_id?._id?.toString() || finishedRoom.game_id?.toString();
        if (gameId) {
            this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
        }
        return finishedRoom;
    }
    async handleDropDisc(client, payload) {
        const lang = this.getLang(client);
        if (client.data.isSpectator) {
            return this.emit(client, false, {}, [this.i18n.translate('ws.games.spectatorActionDenied', lang)]);
        }
        const room_id = payload?.room_id || client.data.room_id;
        const col = Number(payload?.col);
        if (!room_id || !Number.isInteger(col)) {
            return this.emit(client, false, {}, [this.i18n.translate('ws.games.invalidMove', lang)]);
        }
        const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds');
        if (!room) {
            return this.emit(client, false, {}, [this.i18n.translate('ws.games.gameNotFound', lang)]);
        }
        const playerNum = this.resolvePlayerNum(client, room);
        if (playerNum !== 1 && playerNum !== 2) {
            return this.emit(client, false, {}, [this.i18n.translate('ws.games.notInRoom', lang)]);
        }
        client.data.playerNum = playerNum;
        if (room.status === 'finished') {
            return this.emit(client, false, {}, [this.i18n.translate('ws.games.roomInactive', lang)]);
        }
        if (room.status !== 'started') {
            return this.emit(client, false, {}, [this.i18n.translate('ws.games.gameNotFound', lang)]);
        }
        const isMember = room.players.some((p) => p.playerId.toString() === client.data.player_id);
        if (!isMember) {
            return this.emit(client, false, {}, [this.i18n.translate('ws.games.notInRoom', lang)]);
        }
        const game = await this.gameModel.findOne({ room_id: new mongoose_2.Types.ObjectId(room_id) });
        if (!game) {
            return this.emit(client, false, {}, [this.i18n.translate('ws.games.gameNotFound', lang)]);
        }
        if (game.current_player !== playerNum) {
            return this.emit(client, false, {}, [this.i18n.translate('ws.games.notYourTurn', lang)]);
        }
        const color = (0, connect_four_game_logic_1.colorForPlayerNum)(playerNum);
        const board = (0, connect_four_game_logic_1.coerceConnectFourBoard)(game.board);
        const result = (0, connect_four_game_logic_1.dropDisc)(board, col, color);
        if (!result.ok) {
            return this.emit(client, false, { col }, [this.i18n.translate('ws.games.invalidMove', lang)]);
        }
        game.board = result.board;
        game.turn_start_time = new Date();
        game.last_move = {
            userId: client.data.player_id,
            row: result.row,
            col: result.col,
            color,
            at: new Date(),
        };
        let finished = false;
        let winnerNum = null;
        let isDraw = false;
        if (result.win.won) {
            finished = true;
            winnerNum = playerNum;
            game.winning_cells = result.win.winningCells;
        }
        else if (result.isDraw) {
            finished = true;
            isDraw = true;
            game.winning_cells = [];
        }
        else {
            game.current_player = playerNum === 1 ? 2 : 1;
        }
        game.move_revision = (game.move_revision ?? 0) + 1;
        game.markModified('board');
        game.markModified('winning_cells');
        game.markModified('last_move');
        game.markModified('move_revision');
        try {
            await game.save();
        }
        catch (err) {
            this.logger.error(`event=connect_four_save_failed room=${room_id} finished=${finished}`, err);
            return this.emit(client, false, { col }, [
                this.i18n.translate('ws.games.invalidMove', lang),
            ]);
        }
        this.logger.log(`event=connect_four_move room=${room_id} col=${col} revision=${game.move_revision} finished=${finished}`);
        const limit = room.game_id?.turn_timer_seconds || 30;
        const sockets = await this.server.in(room_id).fetchSockets();
        clearTimer(client.id);
        if (finished) {
            for (const s of sockets) {
                clearTimer(s.id);
            }
            room.status = 'finished';
            room.finished_at = new Date();
            room.winner_reason = isDraw ? 'draw' : 'win';
            room.winner = isDraw
                ? undefined
                : winnerNum === 1
                    ? game.player1_id
                    : game.player2_id;
        }
        else {
            const opponent = sockets.find((s) => this.resolvePlayerNum(s, room) === game.current_player);
            if (opponent) {
                this.startTimer(opponent, room_id, limit);
            }
            room.turn_start_time = new Date();
            await room.save();
        }
        const displayPrize = (0, game_prize_util_1.winnerDisplayedPrize)(room.bet_amount, room.house_edge, room.players.length);
        const lastMove = {
            userId: client.data.player_id,
            row: result.row,
            col: result.col,
            color,
            at: new Date().toISOString(),
        };
        for (const s of sockets) {
            try {
                const sLang = this.getLang(s);
                const sIsSpectator = s.data.isSpectator || false;
                const sPNum = this.resolvePlayerNum(s, room);
                if (sPNum)
                    s.data.playerNum = sPNum;
                const isWinner = finished && !isDraw && winnerNum === sPNum;
                const sState = await this.buildPublicState(room, game, sIsSpectator ? null : sPNum, sIsSpectator);
                let msg = '';
                if (finished) {
                    if (isDraw) {
                        msg = this.i18n.translate('ws.games.drawGeneric', sLang);
                    }
                    else {
                        msg = isWinner
                            ? this.i18n.translate('ws.games.win', sLang)
                            : this.i18n.translate('ws.games.lose', sLang);
                    }
                }
                else if (s.id === client.id) {
                    msg = this.i18n.translate('ws.games.moveAccepted', sLang);
                }
                else {
                    msg = this.i18n.translate('ws.games.opponentMoved', sLang);
                }
                s.emit(EVENT, {
                    success: true,
                    data: {
                        ...sState,
                        lastMove,
                        gameEnded: finished,
                        gameStarted: !finished,
                        youWon: isWinner && !sIsSpectator,
                        outcome: finished ? (isDraw ? 'draw' : isWinner ? 'win' : 'lose') : '',
                        prize: isWinner ? displayPrize : 0,
                        reason: finished ? (isDraw ? 'draw' : 'win') : undefined,
                        isDraw: finished && isDraw,
                        winnerUserId: finished && !isDraw && winnerNum
                            ? winnerNum === 1
                                ? game.player1_id.toString()
                                : game.player2_id.toString()
                            : null,
                    },
                    messages: [msg],
                });
            }
            catch (emitErr) {
                this.logger.error(`event=connect_four_emit_failed room=${room_id} sid=${s.id} finished=${finished}`, emitErr);
            }
        }
        if (finished) {
            try {
                const settledRoom = await this.finalizeConnectFourMatch(room_id, game, isDraw ? { kind: 'draw' } : { kind: 'win', winnerNum: winnerNum });
                if (settledRoom) {
                    room.status = settledRoom.status;
                    room.winner = settledRoom.winner;
                    room.winner_reason = settledRoom.winner_reason;
                    room.finished_at = settledRoom.finished_at;
                }
                else {
                    this.logger.error(`event=connect_four_finalize_failed room=${room_id} reason=room_not_started`);
                }
            }
            catch (finalizeErr) {
                this.logger.error(`event=connect_four_finalize_error room=${room_id} finished=${finished}`, finalizeErr);
            }
        }
    }
    async handleForfeit(client, payload) {
        const lang = this.getLang(client);
        if (client.data.isSpectator) {
            return this.emit(client, false, {}, [this.i18n.translate('ws.games.spectatorActionDenied', lang)]);
        }
        const room_id = payload?.room_id || client.data.room_id;
        const player_id = client.data.player_id;
        if (!room_id || !player_id) {
            return this.emit(client, false, {}, [this.i18n.translate('ws.invalidMessageFormat', lang)]);
        }
        await this.grace.cancel('connect-four', player_id);
        await this.executeForfeit(room_id, player_id);
        this.emit(client, true, { gameEnded: true, outcome: 'forfeit' }, [
            this.i18n.translate('ws.games.lose', lang),
        ]);
    }
    startTimer(socket, room_id, seconds) {
        clearTimer(socket.id);
        const t = setTimeout(async () => {
            const game = await this.gameModel.findOne({ room_id: new mongoose_2.Types.ObjectId(room_id) });
            if (!game)
                return;
            const winnerNum = game.current_player === 1 ? 2 : 1;
            const winnerId = winnerNum === 1 ? game.player1_id : game.player2_id;
            const room = await this.roomModel
                .findById(room_id)
                .populate('game_id', 'turn_timer_seconds');
            if (!room || room.status !== 'started')
                return;
            room.status = 'finished';
            room.winner = winnerId;
            room.winner_reason = 'timeout';
            room.finished_at = new Date();
            await room.save();
            const grossPayout = (0, game_prize_util_1.winnerGrossPayout)(room.bet_amount, room.house_edge, room.players.length);
            const displayPrize = (0, game_prize_util_1.winnerDisplayedPrize)(room.bet_amount, room.house_edge, room.players.length);
            await this.userModel.updateOne({ _id: winnerId }, { $inc: { balance: grossPayout } });
            const sockets = await this.server.in(room_id).fetchSockets();
            const winnerUsername = await this.getCachedUsername(winnerId.toString());
            for (const s of sockets) {
                const sIsSpectator = s.data.isSpectator || false;
                const sPNum = this.resolvePlayerNum(s, room);
                if (sPNum)
                    s.data.playerNum = sPNum;
                const isWinnerFound = sPNum === winnerNum;
                const sLang = this.getLang(s);
                const sState = await this.buildPublicState(room, game, sIsSpectator ? null : sPNum, sIsSpectator);
                s.emit(EVENT, {
                    success: true,
                    data: {
                        ...sState,
                        gameEnded: true,
                        outcome: isWinnerFound ? 'win' : 'timeout_loss',
                        youWon: isWinnerFound && !sIsSpectator,
                        winner: sIsSpectator ? winnerUsername : winnerId.toString(),
                        winnerUserId: winnerId.toString(),
                        reason: 'timeout',
                        prize: isWinnerFound ? displayPrize : 0,
                        isSpectator: sIsSpectator,
                    },
                    messages: sIsSpectator
                        ? [this.i18n.translate('ws.games.winsTimeout', sLang, { username: winnerUsername })]
                        : [
                            isWinnerFound
                                ? this.i18n.translate('ws.games.timeoutWin', sLang)
                                : this.i18n.translate('ws.games.timeoutLoss', sLang),
                        ],
                });
            }
            const gameId = room.game_id?._id?.toString() || room.game_id?.toString();
            if (gameId)
                this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
        }, seconds * 1000);
        turnTimers.set(socket.id, t);
    }
};
exports.ConnectFourGateway = ConnectFourGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], ConnectFourGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('join'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], ConnectFourGateway.prototype, "handleJoin", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('get_state'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], ConnectFourGateway.prototype, "handleGetState", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('drop_disc'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], ConnectFourGateway.prototype, "handleDropDisc", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('forfeit'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], ConnectFourGateway.prototype, "handleForfeit", null);
exports.ConnectFourGateway = ConnectFourGateway = ConnectFourGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({ namespace: '/connect-four', cors: { origin: '*', credentials: true } }),
    __param(0, (0, mongoose_1.InjectModel)(connect_four_game_schema_1.ConnectFourGame.name)),
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
], ConnectFourGateway);
//# sourceMappingURL=connect-four.gateway.js.map