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
var NavalBattleGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NavalBattleGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const grace_period_service_1 = require("../../../common/grace-period/grace-period.service");
const config_1 = require("@nestjs/config");
const socket_io_1 = require("socket.io");
const mongoose_2 = require("mongoose");
const ws_auth_middleware_1 = require("../../../common/guards/ws-auth.middleware");
const redis_module_1 = require("../../../common/redis/redis.module");
const battleship_placement_schema_1 = require("../../naval-battle/schemas/battleship-placement.schema");
const room_schema_1 = require("../../room/schemas/room.schema");
const rooms_gateway_1 = require("../rooms/rooms.gateway");
const i18n_service_1 = require("../../../common/i18n/i18n.service");
const game_prize_util_1 = require("../../../common/utils/game-prize.util");
const turnTimers = new Map();
const clearTimer = (id) => { const t = turnTimers.get(id); if (t) {
    clearTimeout(t);
    turnTimers.delete(id);
} };
let NavalBattleGateway = NavalBattleGateway_1 = class NavalBattleGateway {
    placementModel;
    roomModel;
    userModel;
    config;
    roomsGateway;
    redis;
    i18n;
    grace;
    server;
    logger = new common_1.Logger(NavalBattleGateway_1.name);
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
    constructor(placementModel, roomModel, userModel, config, roomsGateway, redis, i18n, grace) {
        this.placementModel = placementModel;
        this.roomModel = roomModel;
        this.userModel = userModel;
        this.config = config;
        this.roomsGateway = roomsGateway;
        this.redis = redis;
        this.i18n = i18n;
        this.grace = grace;
    }
    onModuleInit() {
        this.grace.registerHandler('naval-battle', (playerId, roomId) => this.executeForfeit(roomId, playerId));
    }
    afterInit(server) { (0, ws_auth_middleware_1.applyWsAuth)(server, this.config, this.redis); }
    async handleConnection(client) {
        const player_id = client.data.player_id;
        if (player_id) {
            const room = await this.roomModel.findOne({
                status: { $in: [room_schema_1.RoomStatus.STARTED, room_schema_1.RoomStatus.WAITING] },
                'players.playerId': new mongoose_2.Types.ObjectId(player_id)
            });
            if (room) {
                this.logger.log(`[NavalBattle] 🔄 Auto-reconnection detected | player=${player_id} | room=${room._id}`);
                await client.join(room._id.toString());
                client.data.room_id = room._id.toString();
                await this.syncPlayerState(client, room._id.toString(), player_id);
                await this.grace.cancel('naval-battle', player_id);
            }
        }
        this.logger.log(`[NavalBattle] Connected: ${client.id}`);
    }
    async handleDisconnect(client) {
        const { room_id, player_id } = client.data;
        if (!room_id || !player_id) {
            clearTimer(client.id);
            return;
        }
        const room = await this.roomModel.findById(room_id);
        if (!room)
            return;
        const totalMoves = (room.players[0]?.moves?.length || 0) + (room.players[1]?.moves?.length || 0);
        await this.redis.set(`last_move_index:naval-battle:${room_id}:${player_id}`, totalMoves.toString(), 'EX', 300);
        if (turnTimers.has(client.id)) {
            await this.redis.set(`timer:naval-battle:${room_id}`, "30", 'EX', 60);
        }
        clearTimer(client.id);
        const isSpectator = room.spectators?.some((id) => id.toString() === player_id);
        if (isSpectator) {
            const updated = await this.roomModel.findOneAndUpdate({ _id: room_id }, { $pull: { spectators: new mongoose_2.Types.ObjectId(player_id) } }, { returnDocument: 'after' });
            client.to(room_id).emit('naval-battle', { success: true, data: { spectatorsCount: updated?.spectators?.length || 0 }, messages: [] });
            return;
        }
        this.processForfeit(client, room_id, player_id);
    }
    getLang(client) {
        return client.handshake?.query?.lang || client.data?.lang || 'en';
    }
    async processForfeit(client, room_id, player_id) {
        const room = await this.roomModel.findOne({ _id: new mongoose_2.Types.ObjectId(room_id), 'players.playerId': new mongoose_2.Types.ObjectId(player_id) }).populate('game_id', 'turn_timer_seconds');
        if (!room || room.status === 'finished')
            return;
        const lang = this.getLang(client);
        if (room.status === 'waiting') {
            const updated = await this.roomModel.findOneAndUpdate({ _id: new mongoose_2.Types.ObjectId(room_id), 'players.playerId': new mongoose_2.Types.ObjectId(player_id) }, { $pull: { players: { playerId: new mongoose_2.Types.ObjectId(player_id) } } }, { returnDocument: 'after' });
            const roomOid = new mongoose_2.Types.ObjectId(room_id);
            const allPlacements = await this.placementModel.find({ room_id: roomOid });
            const refundAmount = Number(room.bet_amount);
            for (const p of allPlacements) {
                if (refundAmount > 0) {
                    await this.userModel.updateOne({ _id: p.player_id }, { $inc: { balance: refundAmount } });
                }
            }
            await this.placementModel.deleteMany({ room_id: roomOid });
            if (updated && updated.players.length > 0) {
                await this.roomModel.updateOne({ _id: roomOid }, { $set: { 'players.$[].ready': false } });
            }
            const gameIdForLobby = room.game_id?._id?.toString() || room.game_id?.toString();
            if (updated?.players.length === 0) {
                await this.roomModel.findOneAndDelete({ _id: room_id, players: { $size: 0 } });
                if (gameIdForLobby)
                    this.roomsGateway.broadcastRoomUpdate(gameIdForLobby, 'roomDeleted', { id: room_id });
            }
            else {
                client.to(room_id).emit('naval-battle', { success: true, data: { opponentLeft: true, waitingForOpponent: true, resetPlacement: true }, messages: [this.i18n.translate('ws.games.opponentLeft', lang)] });
                if (gameIdForLobby) {
                    const populated = await this.roomModel
                        .findById(roomOid)
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
            const limit = (room.game_id?.turn_timer_seconds || 30) * 1000;
            let remainingTurnSecs = 0;
            if (room.turn_start_time) {
                remainingTurnSecs = Math.ceil((limit - (Date.now() - new Date(room.turn_start_time).getTime())) / 1000);
            }
            await this.grace.start('naval-battle', player_id, room_id, Math.max(60, remainingTurnSecs));
        }
    }
    async executeForfeit(room_id, player_id) {
        const room = await this.roomModel.findOne({ _id: new mongoose_2.Types.ObjectId(room_id), status: 'started' });
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
        const sockets = await this.server.in(room_id).fetchSockets();
        for (const s of sockets) {
            const sIsSpectator = s.data.isSpectator || false;
            const sLang = this.getLang(s);
            s.emit('naval-battle', {
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
        const player_id = client.data.player_id;
        const room_id = payload?.room_id;
        await this.grace.cancel('naval-battle', player_id);
        await this.syncPlayerState(client, room_id, player_id);
    }
    async syncPlayerState(client, room_id, player_id) {
        const lang = this.getLang(client);
        if (!room_id)
            return client.emit('naval-battle', { success: false, messages: [this.i18n.translate('ws.invalidMessageFormat', lang)] });
        const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds');
        if (!room)
            return client.emit('naval-battle', { success: false, messages: [this.i18n.translate('ws.games.gameNotFound', lang)] });
        if (room.status === room_schema_1.RoomStatus.FINISHED)
            return client.emit('naval-battle', { success: false, messages: [this.i18n.translate('ws.games.roomInactive', lang)] });
        const isMember = room.players.some((p) => p.playerId.toString() === player_id);
        const isSpectator = room.spectators?.some((id) => id.toString() === player_id);
        if (!isMember && !isSpectator)
            return client.emit('naval-battle', { success: false, messages: [this.i18n.translate('ws.games.notInRoom', lang)] });
        await client.join(room_id);
        client.data.room_id = room_id;
        client.data.isSpectator = !isMember;
        if (client.data.isSpectator) {
            this.logger.log(`[NavalBattle] 👀 Spectator joined | room=${room_id} | player=${player_id}`);
            const p1Id = room.players[0]?.playerId?.toString();
            const p2Id = room.players[1]?.playerId?.toString();
            const player1 = p1Id ? await this.getCachedUsername(p1Id) : 'Unknown';
            const player2 = p2Id ? await this.getCachedUsername(p2Id) : 'Unknown';
            let shotFrom = 'Unknown';
            if (room.status === room_schema_1.RoomStatus.STARTED) {
                const sockets = await this.server.in(room_id).fetchSockets();
                const activeTimerSocket = sockets.find(s => turnTimers.has(s.id) && !s.data.isSpectator);
                if (activeTimerSocket) {
                    shotFrom = await this.getCachedUsername(activeTimerSocket.data.player_id);
                }
                else {
                    shotFrom = player1;
                }
            }
            return client.emit('naval-battle', { success: true, data: {
                    waitingForOpponent: false, gameStarted: room.status === room_schema_1.RoomStatus.STARTED,
                    yourTurn: false, turnTimerSeconds: 30,
                    isSpectator: true, spectatorsCount: room.spectators.length,
                    player1, player2, shotFrom, turnOf: shotFrom,
                    history: room.players.flatMap((p, i) => p.moves.map(m => ({ ...m.data, player: i === 0 ? player1 : player2 })))
                }, messages: [] });
        }
        const socketsInRoom = await this.server.in(room_id).fetchSockets();
        if (socketsInRoom.length > 1) {
            const username = await this.getCachedUsername(player_id);
            client.to(room_id).emit('naval-battle', { success: true, data: { opponentJoined: true, opponentName: username }, messages: [this.i18n.translate('ws.games.opponentJoined', lang, { username })] });
        }
        const p1Id = room.players[0]?.playerId?.toString();
        const p2Id = room.players[1]?.playerId?.toString();
        const player1 = p1Id ? await this.getCachedUsername(p1Id) : 'Unknown';
        const player2 = p2Id ? await this.getCachedUsername(p2Id) : 'Unknown';
        const opponent_id = room.players.find((p) => p.playerId.toString() !== player_id)?.playerId?.toString();
        const roomObjId = new mongoose_2.Types.ObjectId(room_id);
        const playerObjId = new mongoose_2.Types.ObjectId(player_id);
        const opponentObjId = opponent_id ? new mongoose_2.Types.ObjectId(opponent_id) : null;
        const [myPlacement, opponentPlacement, timeLeft, lastMoveIndexStr] = await Promise.all([
            this.placementModel.findOne({ room_id: roomObjId, player_id: playerObjId }),
            opponentObjId ? this.placementModel.findOne({ room_id: roomObjId, player_id: opponentObjId }) : null,
            this.redis.get(`timer:naval-battle:${room_id}`),
            this.redis.get(`last_move_index:naval-battle:${room_id}:${player_id}`)
        ]);
        if (myPlacement) {
            const history = room.players.flatMap((p, i) => p.moves.map(m => ({ ...m.data, player: i === 0 ? player1 : player2 })));
            let missedShots = [];
            if (lastMoveIndexStr) {
                const lastIndex = parseInt(lastMoveIndexStr);
                missedShots = history.slice(lastIndex);
                await this.redis.del(`last_move_index:naval-battle:${room_id}:${player_id}`);
            }
            const sockets = await this.server.in(room_id).fetchSockets();
            const opponentSocket = sockets.find(s => s.data.player_id === opponent_id && !s.data.isSpectator);
            const isOpponentTurn = opponentSocket && turnTimers.has(opponentSocket.id);
            const isMyTurn = !isOpponentTurn && room.status === room_schema_1.RoomStatus.STARTED;
            if (isMyTurn) {
                const remaining = Number(timeLeft) || 30;
                this.startTimer(client, room_id, remaining);
                await this.redis.del(`timer:naval-battle:${room_id}`);
            }
            return client.emit('naval-battle', { success: true, data: {
                    ships: myPlacement.ships,
                    shotsFired: myPlacement.shotsFired,
                    shotsReceived: opponentPlacement?.shotsFired || [],
                    status: myPlacement.status,
                    waitingForOpponent: room.status === room_schema_1.RoomStatus.WAITING,
                    gameStarted: room.status === room_schema_1.RoomStatus.STARTED,
                    yourTurn: isMyTurn,
                    turnTimerSeconds: 30,
                    isSpectator: false,
                    player1, player2,
                    turnOf: isMyTurn ? player1 : player2,
                    history,
                    missedShots
                }, messages: [this.i18n.translate('ws.games.roomReconnected', lang)] });
        }
        client.emit('naval-battle', { success: true, data: { waitingForOpponent: true, isSpectator: false }, messages: [this.i18n.translate('ws.games.waitingOpponent', lang)] });
    }
    async handlePlaceShips(client, payload) {
        const lang = this.getLang(client);
        const room_id = payload.room_id || client.data.room_id;
        const ships = payload.placements || payload.ships;
        if (!room_id || !ships) {
            this.logger.warn(`[NavalBattle] ❌ Invalid place_ships payload | player=${client.data.player_id} | payload=${JSON.stringify(payload)} | socketRoom=${client.data.room_id}`);
            return client.emit('naval-battle', { success: false, messages: [this.i18n.translate('ws.games.invalidMove', lang)] });
        }
        const player_id = client.data.player_id;
        const room = await this.roomModel.findById(room_id);
        if (!room)
            return client.emit('naval-battle', { success: false, messages: [this.i18n.translate('ws.games.gameNotFound', lang)] });
        const existing = await this.placementModel.findOne({ room_id, player_id });
        if (existing)
            return client.emit('naval-battle', { success: false, messages: [this.i18n.translate('ws.games.shipsAlreadyPlaced', lang)] });
        const deducted = await this.userModel.findOneAndUpdate({ _id: player_id, balance: { $gte: room.bet_amount } }, { $inc: { balance: -room.bet_amount } });
        if (!deducted)
            return client.emit('naval-battle', { success: false, messages: [this.i18n.translate('ws.games.insufficientBalance', lang)] });
        try {
            await this.placementModel.create({ room_id, player_id, ships, status: 'placed' });
        }
        catch (e) {
            this.logger.error(`[NavalBattle] Placement create failed | room=${room_id} player=${player_id}`, e);
            await this.userModel
                .updateOne({ _id: player_id }, { $inc: { balance: room.bet_amount } })
                .catch((refundErr) => this.logger.error(`[NavalBattle] Placement refund failed | player=${player_id}`, refundErr));
            return client.emit('naval-battle', {
                success: false,
                messages: [this.i18n.translate('ws.games.matchmakingError', lang)],
            });
        }
        client.emit('naval-battle', { success: true, data: { shipsPlaced: true }, messages: [this.i18n.translate('ws.games.waitingOpponent', lang)] });
        const allPlacements = await this.placementModel.find({ room_id: new mongoose_2.Types.ObjectId(room_id) });
        if (allPlacements.length === 2) {
            const startedRoom = await this.roomModel.findById(room_id).populate('game_id');
            if (!startedRoom)
                return;
            const transitioned = await this.roomModel.findOneAndUpdate({ _id: room_id, status: 'waiting' }, { $set: { status: 'started', turn_start_time: new Date() } }, { returnDocument: 'after' });
            if (!transitioned)
                return;
            await this.placementModel.updateMany({ room_id }, { status: 'ready' });
            const timerSeconds = startedRoom.game_id?.turn_timer_seconds ?? 30;
            const p1Player = startedRoom.players[0].playerId.toString();
            const allSockets = await this.server.in(room_id).fetchSockets();
            for (const s of allSockets) {
                const pid = s.data.player_id;
                const sIsSpectator = s.data.isSpectator || false;
                const isTurn = pid === p1Player;
                const sLang = this.getLang(s);
                s.emit('naval-battle', { success: true, data: { gameStarted: true, yourTurn: isTurn && !sIsSpectator, turnTimerSeconds: timerSeconds, waitingForOpponent: false, isSpectator: sIsSpectator }, messages: sIsSpectator ? [this.i18n.translate('ws.games.startedRoom', sLang)] : [isTurn ? this.i18n.translate('ws.games.opponentReady', sLang) : this.i18n.translate('ws.games.opponentReadyWait', sLang)] });
                if (isTurn && !sIsSpectator)
                    this.startTimer(s, room_id, timerSeconds);
            }
            const gId = startedRoom.game_id?._id?.toString() || startedRoom.game_id?.toString();
            const populated = await this.roomModel.findById(room_id).populate('game_id', '-created_at').populate('players.playerId', 'username').lean();
            if (gId)
                this.roomsGateway.broadcastRoomUpdate(gId, 'roomUpdated', populated);
        }
    }
    async handleFire(client, payload) {
        const lang = this.getLang(client);
        const room_id = payload.room_id || client.data.room_id;
        let { target } = payload;
        if (!target && payload.row !== undefined && payload.col !== undefined) {
            target = { row: Number(payload.row), col: Number(payload.col) };
        }
        if (!room_id || !target) {
            this.logger.warn(`[NavalBattle] ❌ Invalid fire payload | player=${client.data.player_id} | payload=${JSON.stringify(payload)} | socketRoom=${client.data.room_id}`);
            return client.emit('naval-battle', { success: false, messages: [this.i18n.translate('ws.games.invalidMove', lang)] });
        }
        const { row, col } = target;
        const player_id = client.data.player_id;
        if (client.data.isSpectator)
            return client.emit('naval-battle', { success: false, messages: [this.i18n.translate('ws.games.spectatorActionDenied', lang)] });
        this.logger.log(`[NavalBattle] 💥 Fire received | room=${room_id} | player=${player_id} | target=[${row},${col}]`);
        const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds');
        if (!room || room.status !== 'started')
            return client.emit('naval-battle', { success: false, messages: [this.i18n.translate('ws.games.roomInactive', lang)] });
        const timerSeconds = room.game_id?.turn_timer_seconds ?? 30;
        const roomObjId = new mongoose_2.Types.ObjectId(room_id);
        const myPlacement = await this.placementModel.findOne({ room_id: roomObjId, player_id: new mongoose_2.Types.ObjectId(player_id) });
        const opponent = room.players.find((p) => p.playerId.toString() !== player_id);
        const opponentPlacement = await this.placementModel.findOne({ room_id: roomObjId, player_id: new mongoose_2.Types.ObjectId(opponent?.playerId.toString()) });
        if (!myPlacement || !opponentPlacement)
            return client.emit('naval-battle', { success: false, messages: [this.i18n.translate('ws.games.placementNotFound', lang)] });
        const alreadyFired = myPlacement.shotsFired.some(s => s[0] === row && s[1] === col);
        if (alreadyFired)
            return client.emit('naval-battle', { success: false, messages: [this.i18n.translate('ws.games.alreadyFiredCell', lang)] });
        let hit = false, shipType = null;
        for (const ship of opponentPlacement.ships) {
            if (ship.cells.some(cell => cell[0] === row && cell[1] === col)) {
                hit = true;
                shipType = ship.type;
                break;
            }
        }
        myPlacement.shotsFired.push([row, col]);
        await myPlacement.save();
        const moveIndex = room.players.find((p) => p.playerId.toString() === player_id)?.moves?.length ?? 0;
        await this.roomModel.updateOne({ _id: roomObjId, 'players.playerId': new mongoose_2.Types.ObjectId(player_id) }, { $push: { 'players.$.moves': { data: { row, col, outcome: 'pending' } } } });
        const allSunk = opponentPlacement.ships.every(ship => ship.cells.every(cell => myPlacement.shotsFired.some(s => s[0] === cell[0] && s[1] === cell[1])));
        let outcome = 'miss';
        if (allSunk)
            outcome = 'win';
        else if (hit) {
            const allHit = opponentPlacement.ships.find(s => s.type === shipType)?.cells.every(cell => myPlacement.shotsFired.some(s => s[0] === cell[0] && s[1] === cell[1]));
            outcome = allHit ? 'sunk' : 'hit';
        }
        await this.roomModel.updateOne({ _id: roomObjId, 'players.playerId': new mongoose_2.Types.ObjectId(player_id) }, { $set: { [`players.${room.players.findIndex((p) => p.playerId.toString() === player_id)}.moves.${moveIndex}.data.outcome`]: outcome, [`players.${room.players.findIndex((p) => p.playerId.toString() === player_id)}.moves.${moveIndex}.data.shipType`]: shipType } });
        if (allSunk) {
            room.status = 'finished';
            room.winner = new mongoose_2.Types.ObjectId(player_id);
            room.winner_reason = 'normal';
            room.finished_at = new Date();
            await room.save();
            const grossPayout = (0, game_prize_util_1.winnerGrossPayout)(room.bet_amount, room.house_edge, room.players.length);
            const displayPrize = (0, game_prize_util_1.winnerDisplayedPrize)(room.bet_amount, room.house_edge, room.players.length);
            await this.userModel.updateOne({ _id: player_id }, { $inc: { balance: grossPayout } });
            const p1Id = room.players[0]?.playerId?.toString();
            const player1 = await this.getCachedUsername(p1Id);
            const player2 = await this.getCachedUsername(room.players[1]?.playerId?.toString());
            const winnerUsername = await this.getCachedUsername(player_id);
            const sockets = await this.server.in(room_id).fetchSockets();
            for (const s of sockets) {
                const sIsSpectator = s.data.isSpectator || false;
                const sLang = this.getLang(s);
                const pid = s.data.player_id;
                const isWinner = pid === player_id;
                const sData = { outcome: isWinner ? 'win' : 'lose', youWon: isWinner && !sIsSpectator, winner: isWinner ? (sIsSpectator ? winnerUsername : player_id) : (sIsSpectator ? winnerUsername : player_id), reason: 'normal', row, col, shipType, prize: isWinner ? displayPrize : 0, yourTurn: false, gameEnded: true, isSpectator: sIsSpectator };
                if (sIsSpectator) {
                    sData.player1 = player1;
                    sData.player2 = player2;
                    sData.shotFrom = winnerUsername;
                    sData.turnOf = winnerUsername;
                    sData.winner = winnerUsername;
                }
                let msg = '';
                if (isWinner)
                    msg = this.i18n.translate('ws.games.winSunk', sLang, { shipType: shipType || '' });
                else if (sIsSpectator)
                    msg = this.i18n.translate('ws.games.wins', sLang, { username: winnerUsername });
                else
                    msg = this.i18n.translate('ws.games.loseSunk', sLang, { shipType: shipType || '' });
                s.emit('naval-battle', { success: true, data: sData, messages: [msg] });
            }
            const gameId = room.game_id?._id?.toString() || room.game_id?.toString();
            if (gameId)
                this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
            return;
        }
        const keepTurn = outcome === 'hit';
        const shooterUsername = await this.getCachedUsername(player_id);
        const sockets = await this.server.in(room_id).fetchSockets();
        clearTimer(client.id);
        room.turn_start_time = new Date();
        await room.save();
        if (keepTurn)
            this.startTimer(client, room_id, timerSeconds);
        else {
            const oppSocket = sockets.find(s => s.data.player_id === opponent?.playerId.toString());
            if (opponent && oppSocket) {
                this.startTimer(oppSocket, room_id, 30);
            }
        }
        const p1Id = room.players[0]?.playerId?.toString();
        const player1 = await this.getCachedUsername(p1Id);
        const player2 = await this.getCachedUsername(room.players[1]?.playerId?.toString());
        for (const s of sockets) {
            const sIsSpectator = s.data.isSpectator || false;
            const sLang = this.getLang(s);
            const pid = s.data.player_id;
            const isShooter = pid === player_id;
            const sData = { outcome, row, col, shipType: (outcome === 'sunk' ? shipType : null), yourTurn: (isShooter ? keepTurn : !keepTurn) && !sIsSpectator, turnTimerSeconds: timerSeconds, isSpectator: sIsSpectator };
            if (sIsSpectator) {
                sData.player1 = player1;
                sData.player2 = player2;
                sData.shotFrom = shooterUsername;
                sData.turnOf = keepTurn ? shooterUsername : (player_id === p1Id ? player2 : player1);
            }
            let msg = '';
            if (isShooter) {
                if (outcome === 'miss')
                    msg = this.i18n.translate('ws.games.shotMiss', sLang);
                else if (outcome === 'sunk')
                    msg = this.i18n.translate('ws.games.shotSunk', sLang, { shipType: shipType || '' });
                else
                    msg = this.i18n.translate('ws.games.shotHit', sLang);
            }
            else {
                if (sIsSpectator)
                    msg = outcome === 'miss' ? this.i18n.translate('ws.games.shotMiss', sLang) : this.i18n.translate('ws.games.shotHit', sLang);
                else {
                    if (outcome === 'miss')
                        msg = this.i18n.translate('ws.games.opponentMiss', sLang);
                    else if (outcome === 'sunk')
                        msg = this.i18n.translate('ws.games.opponentSunk', sLang, { shipType: shipType || '' });
                    else
                        msg = this.i18n.translate('ws.games.opponentHit', sLang);
                }
            }
            s.emit('naval-battle', { success: true, data: sData, messages: [msg] });
        }
    }
    startTimer(socket, room_id, seconds) {
        if (!socket?.id)
            return;
        clearTimer(socket.id);
        const t = setTimeout(async () => {
            const room = await this.roomModel.findById(room_id);
            if (!room || room.status !== 'started')
                return;
            const currentShooterId = socket.data.player_id;
            const opponent = room.players.find((p) => p.playerId.toString() !== currentShooterId);
            const winnerId = opponent?.playerId;
            if (winnerId) {
                room.status = 'finished';
                room.winner = winnerId;
                room.winner_reason = 'timeout';
                room.finished_at = new Date();
                await room.save();
                const grossPayout = (0, game_prize_util_1.winnerGrossPayout)(room.bet_amount, room.house_edge, room.players.length);
                const displayPrize = (0, game_prize_util_1.winnerDisplayedPrize)(room.bet_amount, room.house_edge, room.players.length);
                await this.userModel.updateOne({ _id: winnerId }, { $inc: { balance: grossPayout } });
                const winnerUsername = await this.getCachedUsername(winnerId.toString());
                const sockets = await this.server.in(room_id).fetchSockets();
                for (const s of sockets) {
                    const sLang = this.getLang(s);
                    const socketPlayerId = s.data.player_id;
                    const isWinner = socketPlayerId === winnerId.toString();
                    const sIsSpectator = s.data.isSpectator || false;
                    s.emit('naval-battle', {
                        success: true,
                        data: { gameEnded: true, outcome: isWinner ? 'win' : 'timeout_loss', youWon: isWinner && !sIsSpectator, winner: sIsSpectator ? winnerUsername : winnerId, reason: 'timeout', prize: isWinner ? displayPrize : 0, isSpectator: sIsSpectator },
                        messages: sIsSpectator ? [this.i18n.translate('ws.games.winsTimeout', sLang, { username: winnerUsername })] : [isWinner ? this.i18n.translate('ws.games.timeoutWin', sLang) : this.i18n.translate('ws.games.timeoutLoss', sLang)]
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
exports.NavalBattleGateway = NavalBattleGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], NavalBattleGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('join'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], NavalBattleGateway.prototype, "handleJoin", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('place_ships'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], NavalBattleGateway.prototype, "handlePlaceShips", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('fire'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", Promise)
], NavalBattleGateway.prototype, "handleFire", null);
exports.NavalBattleGateway = NavalBattleGateway = NavalBattleGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({ namespace: '/naval-battle', cors: { origin: '*', credentials: true } }),
    __param(0, (0, mongoose_1.InjectModel)(battleship_placement_schema_1.BattleshipPlacement.name)),
    __param(1, (0, mongoose_1.InjectModel)('Room')),
    __param(2, (0, mongoose_1.InjectModel)('User')),
    __param(5, (0, common_1.Inject)(redis_module_1.REDIS_CLIENT)),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        config_1.ConfigService,
        rooms_gateway_1.RoomsGateway, Object, i18n_service_1.I18nService,
        grace_period_service_1.GracePeriodService])
], NavalBattleGateway);
//# sourceMappingURL=naval-battle.gateway.js.map