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
var RoomService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoomService = void 0;
const common_1 = require("@nestjs/common");
const uno_game_constants_1 = require("../../common/constants/uno-game.constants");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const room_schema_1 = require("./schemas/room.schema");
const business_exception_1 = require("../../common/exceptions/business.exception");
const game_prize_util_1 = require("../../common/utils/game-prize.util");
const rooms_gateway_1 = require("../websockets/rooms/rooms.gateway");
const naval_battle_gateway_1 = require("../websockets/naval-battle/naval-battle.gateway");
const halma_gateway_1 = require("../websockets/halma/halma.gateway");
const chess_gateway_1 = require("../websockets/chess/chess.gateway");
const domino_gateway_1 = require("../websockets/domino/domino.gateway");
const uno_gateway_1 = require("../websockets/uno/uno.gateway");
const connect_four_gateway_1 = require("../websockets/connect-four/connect-four.gateway");
let RoomService = RoomService_1 = class RoomService {
    roomModel;
    gameModel;
    userModel;
    placementModel;
    roomsGateway;
    navalBattleGateway;
    halmaGateway;
    chessGateway;
    dominoGateway;
    unoGateway;
    connectFourGateway;
    logger = new common_1.Logger(RoomService_1.name);
    constructor(roomModel, gameModel, userModel, placementModel, roomsGateway, navalBattleGateway, halmaGateway, chessGateway, dominoGateway, unoGateway, connectFourGateway) {
        this.roomModel = roomModel;
        this.gameModel = gameModel;
        this.userModel = userModel;
        this.placementModel = placementModel;
        this.roomsGateway = roomsGateway;
        this.navalBattleGateway = navalBattleGateway;
        this.halmaGateway = halmaGateway;
        this.chessGateway = chessGateway;
        this.dominoGateway = dominoGateway;
        this.unoGateway = unoGateway;
        this.connectFourGateway = connectFourGateway;
    }
    async getLiveStats() {
        const allSockets = await Promise.all([
            this.navalBattleGateway.server?.fetchSockets() || [],
            this.halmaGateway.server?.fetchSockets() || [],
            this.chessGateway.server?.fetchSockets() || [],
            this.dominoGateway.server?.fetchSockets() || [],
            this.unoGateway.server?.fetchSockets() || [],
            this.connectFourGateway.server?.fetchSockets() || [],
        ]);
        const uniquePlayerIds = new Set();
        for (const sockets of allSockets) {
            for (const s of sockets) {
                const pid = s.data?.player_id;
                if (pid)
                    uniquePlayerIds.add(pid);
            }
        }
        const activeRooms = await this.roomModel.find({ status: room_schema_1.RoomStatus.STARTED }).select('bet_amount').lean();
        let totalBetAmount = 0;
        for (const room of activeRooms) {
            totalBetAmount += room.bet_amount || 0;
        }
        return {
            success: true,
            messages: [],
            data: {
                playersOnline: uniquePlayerIds.size,
                activeGames: activeRooms.length,
                totalBetAmount,
            },
        };
    }
    async getRooms(gameId, lang = 'en') {
        const rooms = await this.roomModel
            .find({
            game_id: new mongoose_2.Types.ObjectId(gameId),
            status: { $in: [room_schema_1.RoomStatus.WAITING, room_schema_1.RoomStatus.STARTED] },
            $or: [{ source: { $exists: false } }, { source: 'casual' }],
        })
            .populate('game_id', '-created_at')
            .populate('players.playerId', 'username')
            .select('-finished_at -winner')
            .lean();
        return { success: true, messages: [], data: this.localizeRooms(rooms, lang) };
    }
    async getRoom(id, lang = 'en') {
        const room = await this.roomModel
            .findById(id)
            .populate('game_id', '-created_at')
            .populate('players.playerId', 'username')
            .lean();
        if (!room)
            throw new business_exception_1.BusinessException('ERROR_NOT_FOUND', 404);
        return { success: true, messages: [], data: this.localizeRooms([room], lang)[0] };
    }
    async getRoomStatus(id) {
        const room = await this.roomModel.findById(id).populate('game_id', 'name').lean();
        if (!room)
            throw new business_exception_1.BusinessException('ERROR_NOT_FOUND', 404);
        return {
            success: true,
            messages: [],
            data: {
                id: room._id,
                status: room.status,
                playerCount: room.players.length,
                bet_amount: room.bet_amount,
                currentPlayer: room.status === room_schema_1.RoomStatus.STARTED ? room.players[0].playerId : null,
                winner: room.winner || null,
                winner_reason: room.winner_reason || (room.status === room_schema_1.RoomStatus.STARTED ? 'playing' : null),
            },
        };
    }
    async getActiveRoomForUser(userId, lang = 'en') {
        const active = await this.roomModel
            .findOne({
            'players.playerId': new mongoose_2.Types.ObjectId(userId),
            status: { $in: [room_schema_1.RoomStatus.WAITING, room_schema_1.RoomStatus.STARTED] },
        })
            .populate('game_id', '-created_at')
            .populate('players.playerId', 'username')
            .lean();
        if (!active) {
            return { success: true, messages: [], data: null };
        }
        const [enriched] = this.localizeRooms([active], lang);
        return { success: true, messages: [], data: enriched };
    }
    async raiseIfAlreadyInActiveRoom(userId, err) {
        const e = err;
        if (e?.code === 11000 && /players_playerId_active_unique/.test(e.message || '')) {
            const active = await this.roomModel
                .findOne({
                'players.playerId': new mongoose_2.Types.ObjectId(userId),
                status: { $in: [room_schema_1.RoomStatus.WAITING, room_schema_1.RoomStatus.STARTED] },
            })
                .select('_id game_id status')
                .lean();
            throw new business_exception_1.BusinessException('ERROR_USER_ALREADY_IN_ROOM', 409, {
                activeRoomId: active?._id?.toString() ?? null,
                gameId: active?.game_id?.toString() ?? null,
                status: active?.status ?? null,
            });
        }
        throw err;
    }
    async createRoom(userId, gameId, betAmount, isPublic, name, playerLimit, lang = 'en') {
        const game = await this.gameModel.findById(gameId);
        if (!game)
            throw new business_exception_1.BusinessException('ERROR_NOT_FOUND', 404);
        if (betAmount < game.min_bet)
            throw new business_exception_1.BusinessException('ERROR_BAD_REQUEST_RESPONSE', 400);
        const effectivePlayerLimit = playerLimit ?? game.max_players;
        if (effectivePlayerLimit < game.min_players || effectivePlayerLimit > game.max_players) {
            throw new business_exception_1.BusinessException('ERROR_BAD_REQUEST_RESPONSE', 400);
        }
        if (game.socket_code === uno_game_constants_1.UNO_SOCKET_CODE && !(0, uno_game_constants_1.isValidUnoPlayerCount)(effectivePlayerLimit)) {
            throw new business_exception_1.BusinessException('ERROR_UNO_INVALID_PLAYER_LIMIT', 400);
        }
        const user = await this.userModel.findById(userId);
        if (!user || user.balance < betAmount)
            throw new business_exception_1.BusinessException('ERROR_GAME_INSUFFICIENT_BALANCE', 400);
        const { randomBytes } = await import('crypto');
        const code = randomBytes(8).toString('hex');
        let room;
        try {
            room = await this.roomModel.create({
                name: name || undefined,
                code,
                game_id: new mongoose_2.Types.ObjectId(gameId),
                bet_amount: betAmount,
                house_edge: game.house_edge,
                public: isPublic,
                player_limit: effectivePlayerLimit,
                players: [{ playerId: new mongoose_2.Types.ObjectId(userId), ready: false }],
            });
        }
        catch (err) {
            await this.raiseIfAlreadyInActiveRoom(userId, err);
            throw err;
        }
        const populated = await this.roomModel
            .findById(room._id)
            .populate('game_id', '-created_at')
            .populate('players.playerId', 'username')
            .lean();
        const [enriched] = this.localizeRooms([populated], lang);
        this.roomsGateway.broadcastRoomUpdate(gameId, 'roomCreated', enriched);
        return room;
    }
    async joinRoom(userId, roomId, lang = 'en') {
        const roomInfo = await this.roomModel.findById(roomId).populate('game_id');
        if (!roomInfo)
            throw new business_exception_1.BusinessException('ERROR_NOT_FOUND', 404);
        if (roomInfo.status !== room_schema_1.RoomStatus.WAITING)
            throw new business_exception_1.BusinessException('ERROR_ROOM_NOT_WAITING', 400);
        const maxPlayers = roomInfo.player_limit || roomInfo.game_id?.max_players;
        if (roomInfo.players.some((p) => p.playerId.toString() === userId))
            throw new business_exception_1.BusinessException('ERROR_ROOM_ALREADY_IN', 400);
        const user = await this.userModel.findById(userId);
        if (!user || user.balance < roomInfo.bet_amount)
            throw new business_exception_1.BusinessException('ERROR_GAME_INSUFFICIENT_BALANCE', 400);
        let room;
        try {
            room = await this.roomModel.findOneAndUpdate({
                _id: roomId,
                status: room_schema_1.RoomStatus.WAITING,
                [`players.${maxPlayers - 1}`]: { $exists: false },
                'players.playerId': { $ne: new mongoose_2.Types.ObjectId(userId) },
            }, { $push: { players: { playerId: new mongoose_2.Types.ObjectId(userId), ready: false } } }, { new: true }).populate('game_id');
        }
        catch (err) {
            await this.raiseIfAlreadyInActiveRoom(userId, err);
            throw err;
        }
        if (!room) {
            const current = await this.roomModel.findById(roomId);
            if (!current)
                throw new business_exception_1.BusinessException('ERROR_NOT_FOUND', 404);
            if (current.status !== room_schema_1.RoomStatus.WAITING)
                throw new business_exception_1.BusinessException('ERROR_ROOM_NOT_WAITING', 400);
            throw new business_exception_1.BusinessException('ERROR_ROOM_FULL', 400);
        }
        const populated = await this.roomModel.findById(room._id).populate('game_id', '-created_at').populate('players.playerId', 'username').lean();
        const [enriched] = this.localizeRooms([populated], lang);
        const gameId = room.game_id?._id?.toString() || room.game_id?.toString();
        this.roomsGateway.broadcastRoomUpdate(gameId, 'roomUpdated', enriched);
        return room;
    }
    async spectateRoom(userId, roomId, lang = 'en') {
        const roomInfo = await this.roomModel.findById(roomId).populate('game_id');
        if (!roomInfo)
            throw new business_exception_1.BusinessException('ERROR_NOT_FOUND', 404);
        if (roomInfo.status !== room_schema_1.RoomStatus.STARTED)
            throw new business_exception_1.BusinessException('ERROR_ROOM_NOT_STARTED', 400);
        const isPlayer = roomInfo.players.some((p) => p.playerId.toString() === userId);
        if (isPlayer && roomInfo.status !== room_schema_1.RoomStatus.STARTED)
            throw new business_exception_1.BusinessException('ERROR_ROOM_ALREADY_IN', 400);
        const isSpectating = roomInfo.spectators?.some((s) => s.toString() === userId);
        if (!isSpectating) {
            roomInfo.spectators.push(new mongoose_2.Types.ObjectId(userId));
            await roomInfo.save();
        }
        const populated = await this.roomModel.findById(roomId).populate('game_id', '-created_at').populate('players.playerId', 'username').lean();
        const [enriched] = this.localizeRooms([populated], lang);
        return enriched;
    }
    async setReady(userId, roomId, ready, lang = 'en') {
        const room = await this.roomModel.findById(roomId).populate('game_id', 'max_players');
        if (!room)
            throw new business_exception_1.BusinessException('ERROR_NOT_FOUND', 404);
        if (room.status !== room_schema_1.RoomStatus.WAITING)
            return room;
        const player = room.players.find((p) => p.playerId.toString() === userId);
        if (!player)
            throw new business_exception_1.BusinessException('ERROR_AUTH', 403);
        if (player.ready)
            return room;
        player.ready = ready;
        await room.save();
        const populated = await this.roomModel.findById(room._id).populate('game_id', '-created_at').populate('players.playerId', 'username').lean();
        const [enriched] = this.localizeRooms([populated], lang);
        const gameId = room.game_id?._id?.toString() || room.game_id?.toString();
        this.roomsGateway.broadcastRoomUpdate(gameId, 'roomUpdated', enriched);
        return room;
    }
    async deleteRoom(roomId) {
        const room = await this.roomModel.findByIdAndDelete(roomId);
        if (!room)
            throw new business_exception_1.BusinessException('ERROR_NOT_FOUND', 404);
        const gameId = room.game_id?.toString();
        if (gameId)
            this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: roomId });
    }
    async leaveRoom(userId, roomId, lang = 'en') {
        const roomInfo = await this.roomModel.findOne({
            _id: new mongoose_2.Types.ObjectId(roomId),
            $or: [
                { 'players.playerId': new mongoose_2.Types.ObjectId(userId) },
                { spectators: new mongoose_2.Types.ObjectId(userId) }
            ]
        }).populate('game_id');
        if (!roomInfo)
            throw new business_exception_1.BusinessException('ERROR_AUTH', 403);
        if (roomInfo.status === room_schema_1.RoomStatus.FINISHED)
            return roomInfo;
        const isSpectator = roomInfo.spectators?.some((id) => id.toString() === userId);
        if (isSpectator) {
            const updated = await this.roomModel.findOneAndUpdate({ _id: roomId }, { $pull: { spectators: new mongoose_2.Types.ObjectId(userId) } }, { new: true });
            const commonPayload = { success: true, data: { spectatorsCount: updated?.spectators?.length || 0 }, messages: [] };
            await this.emitToOthers(this.navalBattleGateway, roomId, userId, 'naval-battle', commonPayload, commonPayload);
            await this.emitToOthers(this.halmaGateway, roomId, userId, 'halma', commonPayload, commonPayload);
            await this.emitToOthers(this.chessGateway, roomId, userId, 'chess', commonPayload, commonPayload);
            await this.emitToOthers(this.dominoGateway, roomId, userId, 'domino', commonPayload, commonPayload);
            await this.emitToOthers(this.unoGateway, roomId, userId, 'uno', commonPayload, commonPayload);
            await this.emitToOthers(this.connectFourGateway, roomId, userId, 'connect-four', commonPayload, commonPayload);
            return updated;
        }
        if (roomInfo.status === room_schema_1.RoomStatus.WAITING) {
            const updated = await this.roomModel.findOneAndUpdate({ _id: roomId, status: room_schema_1.RoomStatus.WAITING, 'players.playerId': new mongoose_2.Types.ObjectId(userId) }, { $pull: { players: { playerId: new mongoose_2.Types.ObjectId(userId) } } }, { new: true });
            if (!updated)
                throw new business_exception_1.BusinessException('ERROR_AUTH', 403);
            const navalBattleGame = await this.gameModel.findOne({
                $or: [{ socket_code: 'naval-battle' }, { socket_code: 'battleship' }, { 'name.en': 'Naval Battle' }]
            });
            const roomGameId = roomInfo.game_id?._id?.toString() || roomInfo.game_id?.toString();
            const isNavalBattle = !!navalBattleGame && roomGameId === navalBattleGame._id.toString();
            this.logger.debug(`Leaving room ${roomId}: isNavalBattle=${isNavalBattle}, roomGameId=${roomGameId}, targetGameId=${navalBattleGame?._id?.toString()}`);
            if (isNavalBattle) {
                const roomOid = new mongoose_2.Types.ObjectId(roomId);
                const allPlacements = await this.placementModel.find({ room_id: roomOid });
                const refundAmount = Number(roomInfo.bet_amount);
                this.logger.debug(`Naval battle cleanup for room ${roomId}: found ${allPlacements.length} placements to refund.`);
                for (const p of allPlacements) {
                    if (refundAmount > 0) {
                        await this.userModel.updateOne({ _id: p.player_id }, { $inc: { balance: refundAmount } });
                    }
                }
                await this.placementModel.deleteMany({ room_id: roomOid });
                await this.roomModel.updateOne({ _id: roomOid }, { $set: { 'players.$[].ready': false } });
            }
            const gameId = roomInfo.game_id?._id?.toString() || roomInfo.game_id?.toString();
            if (updated.players.length === 0) {
                await this.roomModel.findOneAndDelete({ _id: roomId, players: { $size: 0 } });
                if (gameId)
                    this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: roomId });
                this.serverBroadcast(roomId, {
                    success: false,
                    data: { outcome: 'match_cancelled', gameEnded: true },
                    messages: ['The game was cancelled before starting']
                });
            }
            else {
                const populated = await this.roomModel.findById(roomId).populate('game_id', '-created_at').populate('players.playerId', 'username').lean();
                const [enriched] = this.localizeRooms([populated], lang);
                if (gameId)
                    this.roomsGateway.broadcastRoomUpdate(gameId, 'roomUpdated', enriched);
                const playerPayload = { success: true, data: { opponentLeft: true, waitingForOpponent: true, resetPlacement: isNavalBattle, isSpectator: false }, messages: ['Opponent left the lobby.'] };
                const spectatorPayload = { success: true, data: { playerLeft: true, waitingForOpponent: true, isSpectator: true }, messages: ['A player left the lobby.'] };
                await this.emitToOthers(this.navalBattleGateway, roomId, userId, 'naval-battle', playerPayload, spectatorPayload);
                await this.emitToOthers(this.halmaGateway, roomId, userId, 'halma', playerPayload, spectatorPayload);
                await this.emitToOthers(this.chessGateway, roomId, userId, 'chess', playerPayload, spectatorPayload);
                await this.emitToOthers(this.dominoGateway, roomId, userId, 'domino', playerPayload, spectatorPayload);
                await this.emitToOthers(this.unoGateway, roomId, userId, 'uno', playerPayload, spectatorPayload);
                await this.emitToOthers(this.connectFourGateway, roomId, userId, 'connect-four', playerPayload, spectatorPayload);
            }
            return updated;
        }
        if (roomInfo.status === room_schema_1.RoomStatus.STARTED) {
            const numPlayersAtStart = roomInfo.players.length;
            const gameSocketCode = roomInfo.game_id?.socket_code;
            const isDomino = gameSocketCode === 'domino';
            const isUno = gameSocketCode === 'uno';
            if (numPlayersAtStart > 2 && isDomino) {
                await this.dominoGateway.eliminatePlayer(roomId, userId, 'forfeit');
            }
            else if (numPlayersAtStart > 2 && isUno) {
                await this.unoGateway.eliminatePlayer(roomId, userId, 'forfeit');
            }
            else {
                const winner_id = roomInfo.players.find((p) => p.playerId.toString() !== userId)?.playerId;
                if (winner_id) {
                    const finalized = await this.roomModel.findOneAndUpdate({ _id: new mongoose_2.Types.ObjectId(roomId), status: room_schema_1.RoomStatus.STARTED }, {
                        $set: {
                            status: room_schema_1.RoomStatus.FINISHED,
                            winner: winner_id,
                            winner_reason: 'forfeit',
                            finished_at: new Date(),
                        },
                    }, { new: true });
                    if (!finalized) {
                        this.logger.debug(`[Room] leaveRoom forfeit skipped (already finalized) | room=${roomId} | user=${userId}`);
                        return roomInfo;
                    }
                    const grossPayout = (0, game_prize_util_1.winnerGrossPayout)(roomInfo.bet_amount, roomInfo.house_edge, numPlayersAtStart);
                    const displayPrize = (0, game_prize_util_1.winnerDisplayedPrize)(roomInfo.bet_amount, roomInfo.house_edge, numPlayersAtStart);
                    await this.userModel.updateOne({ _id: winner_id }, { $inc: { balance: grossPayout } });
                    const gameId = roomInfo.game_id?._id?.toString() || roomInfo.game_id?.toString();
                    if (gameId)
                        this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: roomId });
                    const winnerUser = await this.userModel.findById(winner_id).select('username').lean();
                    const winnerUsername = winnerUser?.username || 'Unknown';
                    const playerPayload = {
                        success: true,
                        data: { gameEnded: true, outcome: 'forfeit', youWon: true, winner: winner_id, reason: 'forfeit', prize: displayPrize, isSpectator: false },
                        messages: ['Opponent disconnected. You win by forfeit!']
                    };
                    const spectatorPayload = {
                        success: true,
                        data: { gameEnded: true, outcome: 'forfeit', youWon: false, winner: winnerUsername, reason: 'forfeit', isSpectator: true },
                        messages: ['A player disconnected. Game over.']
                    };
                    await this.emitToOthers(this.navalBattleGateway, roomId, userId, 'naval-battle', playerPayload, spectatorPayload);
                    await this.emitToOthers(this.halmaGateway, roomId, userId, 'halma', playerPayload, spectatorPayload);
                    await this.emitToOthers(this.chessGateway, roomId, userId, 'chess', playerPayload, spectatorPayload);
                    await this.emitToOthers(this.dominoGateway, roomId, userId, 'domino', playerPayload, spectatorPayload);
                    await this.emitToOthers(this.unoGateway, roomId, userId, 'uno', playerPayload, spectatorPayload);
                    await this.emitToOthers(this.connectFourGateway, roomId, userId, 'connect-four', playerPayload, spectatorPayload);
                }
            }
        }
        return roomInfo;
    }
    async saveBattleshipPlacement(userId, roomId, ships, lang = 'en') {
        const SHIP_SIZES = { carrier: 5, battleship: 4, cruiser: 3, submarine: 3, destroyer: 2 };
        const REQUIRED_TYPES = Object.keys(SHIP_SIZES);
        const types = ships.map(s => s.type);
        const typeSet = new Set(types);
        for (const t of REQUIRED_TYPES) {
            if (!typeSet.has(t))
                throw new business_exception_1.BusinessException(`Missing ship type: ${t}`, 400);
        }
        if (types.length !== typeSet.size)
            throw new business_exception_1.BusinessException('Duplicate ship types', 400);
        const allCellKeys = [];
        for (const ship of ships) {
            if (ship.cells && ship.cells.length > 0 && (ship.startRow === undefined || ship.startCol === undefined || ship.isHorizontal === undefined)) {
                ship.startRow = ship.cells[0][0];
                ship.startCol = ship.cells[0][1];
                if (ship.cells.length > 1) {
                    ship.isHorizontal = ship.cells[0][0] === ship.cells[1][0];
                }
                else {
                    ship.isHorizontal = true;
                }
            }
            const expectedSize = SHIP_SIZES[ship.type];
            if (ship.cells.length !== expectedSize)
                throw new business_exception_1.BusinessException(`Ship "${ship.type}" must have ${expectedSize} cells`, 400);
            for (const cell of ship.cells) {
                if (!Array.isArray(cell) || cell.length !== 2 || cell[0] < 0 || cell[0] > 9 || cell[1] < 0 || cell[1] > 9) {
                    throw new business_exception_1.BusinessException(`Invalid cell in ship "${ship.type}"`, 400);
                }
                allCellKeys.push(`${cell[0]},${cell[1]}`);
            }
        }
        if (new Set(allCellKeys).size !== allCellKeys.length)
            throw new business_exception_1.BusinessException('Ships overlap', 400);
        const room = await this.roomModel.findById(roomId).populate('game_id');
        if (!room)
            throw new business_exception_1.BusinessException('ERROR_NOT_FOUND', 404);
        if (room.status !== room_schema_1.RoomStatus.WAITING)
            throw new business_exception_1.BusinessException('Room not in waiting status', 400);
        const player = room.players.find((p) => p.playerId.toString() === userId);
        if (!player)
            throw new business_exception_1.BusinessException('ERROR_AUTH', 403);
        let placement = await this.placementModel.findOne({ room_id: roomId, player_id: userId });
        if (placement) {
            placement.ships = ships;
            await placement.save();
        }
        else {
            const user = await this.userModel.findOneAndUpdate({ _id: userId, balance: { $gte: room.bet_amount } }, { $inc: { balance: -room.bet_amount } }, { new: true });
            if (!user)
                throw new business_exception_1.BusinessException('ERROR_GAME_INSUFFICIENT_BALANCE', 400);
            placement = await this.placementModel.create({ room_id: roomId, player_id: userId, ships, status: 'placed' });
        }
        const updatedRoom = await this.roomModel.findOneAndUpdate({ _id: new mongoose_2.Types.ObjectId(roomId), 'players.playerId': new mongoose_2.Types.ObjectId(userId) }, { $set: { 'players.$.ready': true }, $push: { 'players.$.moves': { data: { type: 'placement' } } } }, { new: true }).populate('game_id', '-created_at').populate('players.playerId', 'username');
        if (!updatedRoom)
            throw new business_exception_1.BusinessException('Error updating room', 500);
        const maxPlayers = updatedRoom.player_limit || updatedRoom.game_id?.max_players;
        const isTournamentRoom = updatedRoom.source === 'tournament';
        let allReady;
        if (isTournamentRoom) {
            const placementCount = await this.placementModel.countDocuments({
                room_id: new mongoose_2.Types.ObjectId(roomId),
            });
            allReady =
                updatedRoom.players.length >= maxPlayers && placementCount >= maxPlayers;
        }
        else {
            allReady =
                updatedRoom.players.length >= maxPlayers &&
                    updatedRoom.players.every((p) => p.ready);
        }
        if (allReady) {
            const startedRoom = await this.roomModel.findOneAndUpdate({ _id: roomId, status: room_schema_1.RoomStatus.WAITING }, { $set: { status: room_schema_1.RoomStatus.STARTED } }, { new: true });
            if (startedRoom) {
                await this.placementModel.updateMany({ room_id: roomId }, { status: 'ready' });
                const timerSeconds = updatedRoom.game_id?.turn_timer_seconds ?? 30;
                const socketsInRoom = await this.navalBattleGateway.server.in(roomId).fetchSockets();
                const p1Id = (updatedRoom.players[0].playerId._id || updatedRoom.players[0].playerId).toString();
                for (const s of socketsInRoom) {
                    const socketPlayerId = s.data.player_id;
                    const isP1 = socketPlayerId === p1Id;
                    s.emit('naval-battle', {
                        success: true,
                        data: { yourTurn: isP1, turnTimerSeconds: timerSeconds, waitingForOpponent: false, gameStarted: true },
                        messages: [isP1 ? 'Opponent is ready. Your turn — fire!' : 'Enemy ships detected. Waiting for opponent to fire.']
                    });
                    if (isP1) {
                        this.navalBattleGateway.startTimer(s, roomId, timerSeconds);
                    }
                }
                const populatedStartedRoom = await this.roomModel.findById(startedRoom._id)
                    .populate('game_id', '-created_at')
                    .populate('players.playerId', 'username')
                    .lean();
                if (populatedStartedRoom) {
                    const [enriched] = this.localizeRooms([populatedStartedRoom], lang);
                    const gameId = populatedStartedRoom.game_id?._id?.toString() || populatedStartedRoom.game_id?.toString();
                    if (gameId)
                        this.roomsGateway.broadcastRoomUpdate(gameId, 'roomUpdated', enriched);
                }
            }
        }
        return { success: true, messages: ['Placement saved'], data: { status: placement.status, roomStatus: updatedRoom.status } };
    }
    localizeRooms(rooms, lang) {
        return rooms.map(room => {
            if (room.game_id?.name) {
                room.game_id = {
                    ...room.game_id,
                    name: lang === 'es' ? room.game_id.name.es : room.game_id.name.en,
                    description: lang === 'es' ? room.game_id.description?.es : room.game_id.description?.en,
                };
                if (room.player_limit)
                    room.game_id.max_players = room.player_limit;
            }
            return room;
        });
    }
    async emitToOthers(gateway, roomId, excludeUserId, eventName, playerPayload, spectatorPayload) {
        if (!gateway?.server)
            return;
        const sockets = await gateway.server.in(roomId).fetchSockets();
        for (const s of sockets) {
            if (s.data?.player_id !== excludeUserId) {
                const isSpectator = s.data?.isSpectator || false;
                s.emit(eventName, isSpectator ? spectatorPayload : playerPayload);
            }
        }
    }
    async serverBroadcast(roomId, payload) {
        this.navalBattleGateway.server.to(roomId).emit('naval-battle', payload);
        this.halmaGateway.server.to(roomId).emit('halma', payload);
        this.chessGateway.server.to(roomId).emit('chess', payload);
        this.dominoGateway.server.to(roomId).emit('domino', payload);
        this.unoGateway.server.to(roomId).emit('uno', payload);
        this.connectFourGateway.server.to(roomId).emit('connect-four', payload);
    }
};
exports.RoomService = RoomService;
exports.RoomService = RoomService = RoomService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, mongoose_1.InjectModel)(room_schema_1.Room.name)),
    __param(1, (0, mongoose_1.InjectModel)('Game')),
    __param(2, (0, mongoose_1.InjectModel)('User')),
    __param(3, (0, mongoose_1.InjectModel)('BattleshipPlacement')),
    __metadata("design:paramtypes", [mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        mongoose_2.Model,
        rooms_gateway_1.RoomsGateway,
        naval_battle_gateway_1.NavalBattleGateway,
        halma_gateway_1.HalmaGateway,
        chess_gateway_1.ChessGateway,
        domino_gateway_1.DominoGateway,
        uno_gateway_1.UnoGateway,
        connect_four_gateway_1.ConnectFourGateway])
], RoomService);
//# sourceMappingURL=room.service.js.map