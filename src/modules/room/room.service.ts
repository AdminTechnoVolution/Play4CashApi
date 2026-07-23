import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Room, RoomDocument, RoomStatus } from './schemas/room.schema';
import { BusinessException } from '../../common/exceptions/business.exception';
import { calculateWinnerSettlement, winnerBalanceUpdate } from '../../common/utils/game-prize.util';
import { RoomsGateway } from '../websockets/rooms/rooms.gateway';
import { NavalBattleGateway } from '../websockets/naval-battle/naval-battle.gateway';
import { HalmaGateway } from '../websockets/halma/halma.gateway';
import { ChessGateway } from '../websockets/chess/chess.gateway';
import { DominoGateway } from '../websockets/domino/domino.gateway';
import { UnoGateway } from '../websockets/uno/uno.gateway';
import { ConnectFourGateway } from '../websockets/connect-four/connect-four.gateway';
import { agentDebugLog } from '../../common/ws/waiting-room-sync.util';
import { TtlCache } from '../../common/ttl-cache';
import { logSlowEvent } from '../../common/perf-log.util';

@Injectable()
export class RoomService {
  private readonly logger = new Logger(RoomService.name);
  private readonly liveStatsCache = new TtlCache<any>();
  private readonly roomsByGameCache = new TtlCache<any>();
  private readonly roomByIdCache = new TtlCache<any>();
  private readonly roomStatusCache = new TtlCache<any>();
  private readonly activeRoomCache = new TtlCache<any>();

  constructor(
    @InjectModel(Room.name) private readonly roomModel: Model<RoomDocument>,
    @InjectModel('Game') private readonly gameModel: Model<any>,
    @InjectModel('User') private readonly userModel: Model<any>,
    @InjectModel('BattleshipPlacement') private readonly placementModel: Model<any>,
    private readonly roomsGateway: RoomsGateway,
    private readonly navalBattleGateway: NavalBattleGateway,
    private readonly halmaGateway: HalmaGateway,
    private readonly chessGateway: ChessGateway,
    private readonly dominoGateway: DominoGateway,
    private readonly unoGateway: UnoGateway,
    private readonly connectFourGateway: ConnectFourGateway,
  ) {}

  // ── LIVE STATS ─────────────────────────────────────────────────────────────

  async getLiveStats(): Promise<any> {
    return this.liveStatsCache.getOrSet('live-room-stats', 5_000, async () => {
      const startedAt = process.hrtime.bigint();
      // Count unique online players across all game namespaces
      const allSockets = await Promise.all([
        this.navalBattleGateway.server?.fetchSockets() || [],
        this.halmaGateway.server?.fetchSockets() || [],
        this.chessGateway.server?.fetchSockets() || [],
        this.dominoGateway.server?.fetchSockets() || [],
        this.unoGateway.server?.fetchSockets() || [],
        this.connectFourGateway.server?.fetchSockets() || [],
      ]);
      const uniquePlayerIds = new Set<string>();
      for (const sockets of allSockets) {
        for (const s of sockets) {
          const pid = (s as any).data?.player_id;
          if (pid) uniquePlayerIds.add(pid);
        }
      }

      // Per-room stake (bet_amount) once per game — not multiplied by player count
      const activeRooms = await this.roomModel
        .find({ status: RoomStatus.STARTED })
        .select('bet_amount')
        .lean();
      let totalBetAmount = 0;
      for (const room of activeRooms) {
        totalBetAmount += room.bet_amount || 0;
      }

      const payload = {
        success: true,
        messages: [],
        data: {
          playersOnline: uniquePlayerIds.size,
          activeGames: activeRooms.length,
          totalBetAmount,
        },
      };
      logSlowEvent(this.logger, 'rooms_live_stats_trace', startedAt, 25, {
        playersOnline: uniquePlayerIds.size,
        activeGames: activeRooms.length,
      });
      return payload;
    });
  }

  // ── GET ROOMS ───────────────────────────────────────────────────────────────

  async getRooms(gameId: string, lang = 'en'): Promise<any> {
    const cacheKey = `rooms:${gameId}:${lang}`;
    return this.roomsByGameCache.getOrSet(cacheKey, 3_000, async () => {
      const startedAt = process.hrtime.bigint();
      const rooms = await this.roomModel
        .find({
          game_id: new Types.ObjectId(gameId),
          status: { $in: [RoomStatus.WAITING, RoomStatus.STARTED] },
          $or: [{ source: { $exists: false } }, { source: 'casual' }],
        })
        .populate('game_id', '-created_at')
        .populate('players.playerId', 'username')
        .select('-finished_at -winner')
        .lean();
      logSlowEvent(this.logger, 'room_list_trace', startedAt, 50, { room_count: rooms.length });
      return { success: true, messages: [], data: this.localizeRooms(rooms, lang) };
    });
  }

  async getRoom(id: string, lang = 'en'): Promise<any> {
    const cacheKey = `room:${id}:${lang}`;
    return this.roomByIdCache.getOrSet(cacheKey, 3_000, async () => {
      const room = await this.roomModel
        .findById(id)
        .populate('game_id', '-created_at')
        .populate('players.playerId', 'username')
        .lean();
      if (!room) throw new BusinessException('ERROR_NOT_FOUND', 404);
      return { success: true, messages: [], data: this.localizeRooms([room], lang)[0] };
    });
  }

  async getRoomStatus(id: string): Promise<any> {
    return this.roomStatusCache.getOrSet(`room-status:${id}`, 2_000, async () => {
      const room = await this.roomModel.findById(id).populate('game_id', 'name').lean();
      if (!room) throw new BusinessException('ERROR_NOT_FOUND', 404);
      return {
        success: true,
        messages: [],
        data: {
          id: room._id,
          status: room.status,
          playerCount: room.players.length,
          playerLimit: room.player_limit || (room.game_id as any)?.max_players || 2,
          bet_amount: room.bet_amount,
          currentPlayer: room.status === RoomStatus.STARTED ? room.players[0].playerId : null,
          winner: room.winner || null,
          winner_reason: room.winner_reason || (room.status === RoomStatus.STARTED ? 'playing' : null),
        },
      };
    });
  }

  // ── ACTIVE ROOM FOR USER ───────────────────────────────────────────────────

  /**
   * Phase C: returns the room the user is currently participating in (status =
   * waiting or started), if any. Backed by the partial unique index, so this is
   * O(1). Used by the PWA on login/home boot to redirect a player back into the
   * match they last left.
   *
   * Shape: `{ success: true, data: <enrichedRoom | null> }`.
   */
  async getActiveRoomForUser(userId: string, lang = 'en'): Promise<any> {
    const cacheKey = `active-room:${userId}:${lang}`;
    return this.activeRoomCache.getOrSet(cacheKey, 3_000, async () => {
      const startedAt = process.hrtime.bigint();
      const active = await this.roomModel
        .findOne({
          'players.playerId': new Types.ObjectId(userId),
          status: { $in: [RoomStatus.WAITING, RoomStatus.STARTED] },
        })
        .populate('game_id', '-created_at')
        .populate('players.playerId', 'username')
        .lean();
      if (!active) {
        logSlowEvent(this.logger, 'room_active_trace', startedAt, 25, { found: false });
        return { success: true, messages: [], data: null };
      }
      const [enriched] = this.localizeRooms([active], lang);
      logSlowEvent(this.logger, 'room_active_trace', startedAt, 25, { found: true });
      return { success: true, messages: [], data: enriched };
    });
  }

  // ── CREATE ROOM ─────────────────────────────────────────────────────────────

  /**
   * Phase C: translate Mongo duplicate-key errors raised by the partial unique
   * index `players_playerId_active_unique` into a domain-friendly exception.
   * Includes the currently active room id so the PWA can redirect there directly.
   */
  private async raiseIfAlreadyInActiveRoom(userId: string, err: unknown): Promise<never> {
    // Mongo dup-key. We only translate when the failing index is the one we own —
    // otherwise rethrow so genuine collisions (e.g. `code` collision) are not masked.
    const e = err as { code?: number; message?: string };
    if (e?.code === 11000 && /players_playerId_active_unique/.test(e.message || '')) {
      const active = await this.roomModel
        .findOne({
          'players.playerId': new Types.ObjectId(userId),
          status: { $in: [RoomStatus.WAITING, RoomStatus.STARTED] },
        })
        .select('_id game_id status')
        .lean();
      throw new BusinessException('ERROR_USER_ALREADY_IN_ROOM', 409, {
        activeRoomId: active?._id?.toString() ?? null,
        gameId: (active as any)?.game_id?.toString() ?? null,
        status: active?.status ?? null,
      });
    }
    throw err as Error;
  }

  async createRoom(
    userId: string,
    gameId: string,
    betAmount: number,
    isPublic: boolean,
    name?: string,
    playerLimit?: number,
    lang = 'en',
  ): Promise<RoomDocument> {
    const game = await this.gameModel.findById(gameId);
    if (!game) throw new BusinessException('ERROR_NOT_FOUND', 404);
    if (betAmount < game.min_bet) throw new BusinessException('ERROR_BAD_REQUEST_RESPONSE', 400);

    const effectivePlayerLimit = playerLimit ?? game.max_players;
    if (effectivePlayerLimit < game.min_players || effectivePlayerLimit > game.max_players) {
      throw new BusinessException('ERROR_BAD_REQUEST_RESPONSE', 400);
    }

    const user = await this.userModel.findById(userId);
    if (!user || user.balance < betAmount) throw new BusinessException('ERROR_GAME_INSUFFICIENT_BALANCE', 400);

    const { randomBytes } = await import('crypto');
    const code = randomBytes(8).toString('hex');

    let room: any;
    try {
      room = await this.roomModel.create({
        name: name || undefined,
        code,
        game_id: new Types.ObjectId(gameId),
        bet_amount: betAmount,
        house_edge: game.house_edge,
        public: isPublic,
        player_limit: effectivePlayerLimit,
        players: [{ playerId: new Types.ObjectId(userId), ready: false }],
      });
    } catch (err) {
      // Phase C: partial unique index on `players.playerId` (active rooms only)
      // catches a user who already has an open room. Translates Mongo's E11000 to
      // ERROR_USER_ALREADY_IN_ROOM with the existing roomId for client redirect.
      await this.raiseIfAlreadyInActiveRoom(userId, err);
      throw err as Error; // unreachable — raiseIfAlreadyInActiveRoom always throws.
    }

    const populated = await this.roomModel
      .findById(room._id)
      .populate('game_id', '-created_at')
      .populate('players.playerId', 'username')
      .lean();
    const [enriched] = this.localizeRooms([populated], lang);

    this.roomsGateway.broadcastRoomUpdate(gameId, 'roomCreated', enriched);
    this.invalidateReadCaches();
    return room;
  }

  // ── JOIN ROOM ───────────────────────────────────────────────────────────────

  async joinRoom(userId: string, roomId: string, lang = 'en'): Promise<RoomDocument> {
    const roomInfo = await this.roomModel.findById(roomId).populate('game_id');
    if (!roomInfo) throw new BusinessException('ERROR_NOT_FOUND', 404);
    if (roomInfo.status !== RoomStatus.WAITING) throw new BusinessException('ERROR_ROOM_NOT_WAITING', 400);

    const maxPlayers = roomInfo.player_limit || (roomInfo.game_id as any)?.max_players;
    if (roomInfo.players.some((p: any) => p.playerId.toString() === userId)) throw new BusinessException('ERROR_ROOM_ALREADY_IN', 400);

    const user = await this.userModel.findById(userId);
    if (!user || user.balance < roomInfo.bet_amount) throw new BusinessException('ERROR_GAME_INSUFFICIENT_BALANCE', 400);

    let room: any;
    try {
      room = await this.roomModel.findOneAndUpdate(
        {
          _id: roomId,
          status: RoomStatus.WAITING,
          [`players.${maxPlayers - 1}`]: { $exists: false },
          'players.playerId': { $ne: new Types.ObjectId(userId) },
        },
        { $push: { players: { playerId: new Types.ObjectId(userId), ready: false } } },
        { new: true },
      ).populate('game_id');
    } catch (err) {
      // Phase C: partial unique index can fire here if the user already has
      // an open room (waiting or started). Translate to ERROR_USER_ALREADY_IN_ROOM.
      await this.raiseIfAlreadyInActiveRoom(userId, err);
      throw err as Error;
    }

    if (!room) {
      const current = await this.roomModel.findById(roomId);
      if (!current) throw new BusinessException('ERROR_NOT_FOUND', 404);
      if (current.status !== RoomStatus.WAITING) throw new BusinessException('ERROR_ROOM_NOT_WAITING', 400);
      throw new BusinessException('ERROR_ROOM_FULL', 400);
    }

    const populated = await this.roomModel.findById(room._id).populate('game_id', '-created_at').populate('players.playerId', 'username').lean();
    const [enriched] = this.localizeRooms([populated], lang);
    const gameId = (room.game_id as any)?._id?.toString() || (room.game_id as any)?.toString();
    this.roomsGateway.broadcastRoomUpdate(gameId, 'roomUpdated', enriched);
    this.invalidateReadCaches();

    return room;
  }

  // ── SPECTATE ROOM ───────────────────────────────────────────────────────────

  async spectateRoom(userId: string, roomId: string, lang = 'en'): Promise<RoomDocument> {
    const roomInfo = await this.roomModel.findById(roomId).populate('game_id');
    if (!roomInfo) throw new BusinessException('ERROR_NOT_FOUND', 404);
    if (roomInfo.status !== RoomStatus.STARTED) throw new BusinessException('ERROR_ROOM_NOT_STARTED', 400);

    const isPlayer = roomInfo.players.some((p: any) => p.playerId.toString() === userId);
    // Allow players to spectate if they was previously in the room but now the room is started (e.g. they were eliminated)
    if (isPlayer && roomInfo.status !== RoomStatus.STARTED) throw new BusinessException('ERROR_ROOM_ALREADY_IN', 400);

    const isSpectating = roomInfo.spectators?.some((s: any) => s.toString() === userId);
    if (!isSpectating) {
      roomInfo.spectators.push(new Types.ObjectId(userId));
      await roomInfo.save();
    }

    const populated = await this.roomModel.findById(roomId).populate('game_id', '-created_at').populate('players.playerId', 'username').lean();
    const [enriched] = this.localizeRooms([populated], lang);
    this.invalidateReadCaches();

    return enriched as any;
  }

  // ── SET READY ───────────────────────────────────────────────────────────────

  async setReady(userId: string, roomId: string, ready: boolean, lang = 'en'): Promise<RoomDocument> {
    const room = await this.roomModel.findById(roomId).populate('game_id', 'max_players');
    if (!room) throw new BusinessException('ERROR_NOT_FOUND', 404);
    if (room.status !== RoomStatus.WAITING) return room;

    const player = room.players.find((p: any) => p.playerId.toString() === userId);
    if (!player) throw new BusinessException('ERROR_AUTH', 403);
    if (player.ready) return room;

    player.ready = ready;
    await room.save();

    const populated = await this.roomModel.findById(room._id).populate('game_id', '-created_at').populate('players.playerId', 'username').lean();
    const [enriched] = this.localizeRooms([populated], lang);
    const gameId = (room.game_id as any)?._id?.toString() || (room.game_id as any)?.toString();
    this.roomsGateway.broadcastRoomUpdate(gameId, 'roomUpdated', enriched);
    this.invalidateReadCaches();

    return room;
  }

  // ── DELETE ROOM ─────────────────────────────────────────────────────────────

  async deleteRoom(roomId: string): Promise<void> {
    const room = await this.roomModel.findByIdAndDelete(roomId);
    if (!room) throw new BusinessException('ERROR_NOT_FOUND', 404);
    const gameId = (room as any).game_id?.toString();
    if (gameId) this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: roomId });
    this.invalidateReadCaches();
  }

  // ── LEAVE ROOM ──────────────────────────────────────────────────────────────

  async leaveRoom(userId: string, roomId: string, lang = 'en'): Promise<any> {
    const roomInfo = await this.roomModel.findOne({
      _id: new Types.ObjectId(roomId),
      $or: [
        { 'players.playerId': new Types.ObjectId(userId) },
        { spectators: new Types.ObjectId(userId) }
      ]
    }).populate('game_id');
    if (!roomInfo) throw new BusinessException('ERROR_AUTH', 403);
    if (roomInfo.status === RoomStatus.FINISHED) return roomInfo;

    const isSpectator = roomInfo.spectators?.some((id: any) => id.toString() === userId);
      if (isSpectator) {
      const updated = await this.roomModel.findOneAndUpdate(
        { _id: roomId },
        { $pull: { spectators: new Types.ObjectId(userId) } },
        { new: true },
      );
      
      // Notify game namespaces of spectator count change
      const commonPayload = { success: true, data: { spectatorsCount: updated?.spectators?.length || 0 }, messages: [] };
      await this.emitToOthers(this.navalBattleGateway, roomId, userId, 'naval-battle', commonPayload, commonPayload);
      await this.emitToOthers(this.halmaGateway, roomId, userId, 'halma', commonPayload, commonPayload);
      await this.emitToOthers(this.chessGateway, roomId, userId, 'chess', commonPayload, commonPayload);
      await this.emitToOthers(this.dominoGateway, roomId, userId, 'domino', commonPayload, commonPayload);
      await this.emitToOthers(this.unoGateway, roomId, userId, 'uno', commonPayload, commonPayload);
      await this.emitToOthers(this.connectFourGateway, roomId, userId, 'connect-four', commonPayload, commonPayload);
      this.invalidateReadCaches();

      return updated;
    }

    if (roomInfo.status === RoomStatus.WAITING) {
      const updated = await this.roomModel.findOneAndUpdate(
        { _id: roomId, status: RoomStatus.WAITING, 'players.playerId': new Types.ObjectId(userId) },
        { $pull: { players: { playerId: new Types.ObjectId(userId) } } },
        { new: true },
      );
      if (!updated) throw new BusinessException('ERROR_AUTH', 403);

      // Identify Naval Battle room - more robust ID-based check
      const navalBattleGame = await this.gameModel.findOne({ 
        $or: [{ socket_code: 'naval-battle' }, { socket_code: 'battleship' }, { 'name.en': 'Naval Battle' }] 
      });
      const roomGameId = (roomInfo.game_id as any)?._id?.toString() || roomInfo.game_id?.toString();
      const isNavalBattle = !!navalBattleGame && roomGameId === navalBattleGame._id.toString();
      
      this.logger.debug(`Leaving room ${roomId}: isNavalBattle=${isNavalBattle}, roomGameId=${roomGameId}, targetGameId=${navalBattleGame?._id?.toString()}`);

      if (isNavalBattle) {
        const roomOid = new Types.ObjectId(roomId);
        const allPlacements = await this.placementModel.find({ room_id: roomOid });
        const refundAmount = Number(roomInfo.bet_amount);
        
        this.logger.debug(`Naval battle cleanup for room ${roomId}: found ${allPlacements.length} placements to refund.`);

        for (const p of allPlacements) {
          if (refundAmount > 0) {
            await this.userModel.updateOne({ _id: p.player_id }, { $inc: { balance: refundAmount } });
          }
        }
        await this.placementModel.deleteMany({ room_id: roomOid });
        
        // Reset ready status for anyone staying
        await this.roomModel.updateOne({ _id: roomOid }, { $set: { 'players.$[].ready': false } });
      }

      const gameId = (roomInfo.game_id as any)?._id?.toString() || roomInfo.game_id?.toString();
      if (updated.players.length === 0) {
        await this.roomModel.findOneAndDelete({ _id: roomId, players: { $size: 0 } });
        if (gameId) this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: roomId });
        
        // Notify game namespaces too
        this.serverBroadcast(roomId, {
          success: false,
          data: { outcome: 'match_cancelled', gameEnded: true },
          messages: ['The game was cancelled before starting']
        });
      } else {
        const populated = await this.roomModel.findById(roomId).populate('game_id', '-created_at').populate('players.playerId', 'username').lean();
        const [enriched] = this.localizeRooms([populated], lang);
        if (gameId) this.roomsGateway.broadcastRoomUpdate(gameId, 'roomUpdated', enriched);

        // Notify game namespaces of opponent leaving - only notify others!
        const playerPayload = { success: true, data: { opponentLeft: true, waitingForOpponent: true, resetPlacement: isNavalBattle, isSpectator: false }, messages: ['Opponent left the lobby.'] };
        const spectatorPayload = { success: true, data: { playerLeft: true, waitingForOpponent: true, isSpectator: true }, messages: ['A player left the lobby.'] };
        
        await this.emitToOthers(this.navalBattleGateway, roomId, userId, 'naval-battle', playerPayload, spectatorPayload);
        await this.emitToOthers(this.halmaGateway, roomId, userId, 'halma', playerPayload, spectatorPayload);
        await this.emitToOthers(this.chessGateway, roomId, userId, 'chess', playerPayload, spectatorPayload);
        await this.emitToOthers(this.dominoGateway, roomId, userId, 'domino', playerPayload, spectatorPayload);
        await this.emitToOthers(this.unoGateway, roomId, userId, 'uno', playerPayload, spectatorPayload);
        await this.emitToOthers(this.connectFourGateway, roomId, userId, 'connect-four', playerPayload, spectatorPayload);
      }
      this.invalidateReadCaches();
      return updated;
    }

    // STARTED → forfeit
    if (roomInfo.status === RoomStatus.STARTED) {
      const numPlayersAtStart = roomInfo.players.length;
      const gameSocketCode = (roomInfo.game_id as any)?.socket_code;
      const isDomino = gameSocketCode === 'domino';
      const isUno = gameSocketCode === 'uno';

      if (numPlayersAtStart > 2 && isDomino) {
        // Multi-player game: eliminate the player, let others continue
        await this.dominoGateway.eliminatePlayer(roomId, userId, 'forfeit');
      } else if (numPlayersAtStart > 2 && isUno) {
        await this.unoGateway.eliminatePlayer(roomId, userId, 'forfeit');
      } else {
        // Standard 1v1 forfeit (or multi-player where only 2 were left).
        //
        // Phase A hardening: previous version did `findOne → mutate → save()`, which
        // allowed two concurrent leaveRoom calls (double-tap, retry) to both observe
        // `status === 'started'` and BOTH credit the winner. We now use an atomic
        // `findOneAndUpdate` keyed on `status: 'started'` so only the first caller
        // performs the payout; concurrent callers see `null` and exit idempotently.
        const winner_id = roomInfo.players.find((p: any) => p.playerId.toString() !== userId)?.playerId;
        if (winner_id) {
          const finalized = await this.roomModel.findOneAndUpdate(
            { _id: new Types.ObjectId(roomId), status: RoomStatus.STARTED },
            {
              $set: {
                status: RoomStatus.FINISHED,
                winner: winner_id,
                winner_reason: 'forfeit',
                finished_at: new Date(),
              },
            },
            { new: true },
          );
          if (!finalized) {
            // Another caller already finalized this room. Return the current state
            // and skip the payout/broadcast.
            this.logger.debug(
              `[Room] leaveRoom forfeit skipped (already finalized) | room=${roomId} | user=${userId}`,
            );
            return roomInfo;
          }

          const settlement = calculateWinnerSettlement(
            roomInfo.bet_amount,
            roomInfo.house_edge,
            numPlayersAtStart,
          );
          const displayPrize = settlement.netPrize;
          await this.userModel.updateOne({ _id: winner_id }, winnerBalanceUpdate(settlement));

          const gameId = (roomInfo.game_id as any)?._id?.toString() || (roomInfo.game_id as any)?.toString();
          if (gameId) this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: roomId });

          // Notify game namespaces of forfeit - only notify others!
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
          this.invalidateReadCaches();
        }
      }
    }

    return roomInfo;
  }

  // ── BATTLESHIP PLACEMENT ────────────────────────────────────────────────────

  async saveBattleshipPlacement(userId: string, roomId: string, ships: any[], lang = 'en'): Promise<any> {
    const SHIP_SIZES = { carrier: 5, battleship: 4, cruiser: 3, submarine: 3, destroyer: 2 };
    const REQUIRED_TYPES = Object.keys(SHIP_SIZES);

    // 1. Validation Logic
    const types = ships.map(s => s.type);
    const typeSet = new Set(types);
    for (const t of REQUIRED_TYPES) {
      if (!typeSet.has(t)) throw new BusinessException(`Missing ship type: ${t}`, 400);
    }
    if (types.length !== typeSet.size) throw new BusinessException('Duplicate ship types', 400);

    const allCellKeys: string[] = [];
    for (const ship of ships) {
      if (ship.cells && ship.cells.length > 0 && (ship.startRow === undefined || ship.startCol === undefined || ship.isHorizontal === undefined)) {
        ship.startRow = ship.cells[0][0];
        ship.startCol = ship.cells[0][1];
        if (ship.cells.length > 1) {
          ship.isHorizontal = ship.cells[0][0] === ship.cells[1][0];
        } else {
          ship.isHorizontal = true;
        }
      }

      const expectedSize = SHIP_SIZES[ship.type as keyof typeof SHIP_SIZES];
      if (ship.cells.length !== expectedSize) throw new BusinessException(`Ship "${ship.type}" must have ${expectedSize} cells`, 400);
      for (const cell of ship.cells) {
        if (!Array.isArray(cell) || cell.length !== 2 || cell[0] < 0 || cell[0] > 9 || cell[1] < 0 || cell[1] > 9) {
          throw new BusinessException(`Invalid cell in ship "${ship.type}"`, 400);
        }
        allCellKeys.push(`${cell[0]},${cell[1]}`);
      }
    }
    if (new Set(allCellKeys).size !== allCellKeys.length) throw new BusinessException('Ships overlap', 400);

    // 2. Room & Status
    const room = await this.roomModel.findById(roomId).populate('game_id');
    if (!room) throw new BusinessException('ERROR_NOT_FOUND', 404);
    if (room.status !== RoomStatus.WAITING) throw new BusinessException('Room not in waiting status', 400);

    const player = room.players.find((p: any) => p.playerId.toString() === userId);
    if (!player) throw new BusinessException('ERROR_AUTH', 403);

    // 3. Save vs Deduct
    let placement = await this.placementModel.findOne({ room_id: roomId, player_id: userId });
    if (placement) {
      placement.ships = ships;
      await placement.save();
    } else {
      const user = await this.userModel.findOneAndUpdate(
        { _id: userId, balance: { $gte: room.bet_amount } },
        { $inc: { balance: -room.bet_amount } },
        { new: true },
      );
      if (!user) throw new BusinessException('ERROR_GAME_INSUFFICIENT_BALANCE', 400);
      placement = await this.placementModel.create({ room_id: roomId, player_id: userId, ships, status: 'placed' });
    }

    // 4. Update Ready Status
    const updatedRoom = await this.roomModel.findOneAndUpdate(
      { _id: new Types.ObjectId(roomId), 'players.playerId': new Types.ObjectId(userId) },
      { $set: { 'players.$.ready': true }, $push: { 'players.$.moves': { data: { type: 'placement' } } } as any },
      { new: true },
    ).populate('game_id', '-created_at').populate('players.playerId', 'username');

    if (!updatedRoom) throw new BusinessException('Error updating room', 500);

    const maxPlayers = updatedRoom.player_limit || (updatedRoom.game_id as any)?.max_players;
    const isTournamentRoom = updatedRoom.source === 'tournament';
    let allReady: boolean;
    if (isTournamentRoom) {
      const placementCount = await this.placementModel.countDocuments({
        room_id: new Types.ObjectId(roomId),
      });
      allReady =
        updatedRoom.players.length >= maxPlayers && placementCount >= maxPlayers;
    } else {
      allReady =
        updatedRoom.players.length >= maxPlayers &&
        updatedRoom.players.every((p: any) => p.ready);
    }

    if (allReady) {
      const startedRoom = await this.roomModel.findOneAndUpdate(
        { _id: roomId, status: RoomStatus.WAITING },
        { $set: { status: RoomStatus.STARTED } },
        { new: true },
      );
      if (startedRoom) {
        await this.placementModel.updateMany({ room_id: roomId }, { status: 'ready' });
        
        // Notify both players via WebSocket
        const timerSeconds = (updatedRoom.game_id as any)?.turn_timer_seconds ?? 30;
        const socketsInRoom = await this.navalBattleGateway.server.in(roomId).fetchSockets();
        const p1Id = ((updatedRoom.players[0].playerId as any)._id || updatedRoom.players[0].playerId).toString();

        for (const s of socketsInRoom) {
          const socketPlayerId = (s as any).data.player_id;
          const isP1 = socketPlayerId === p1Id;
          (s as unknown as any).emit('naval-battle', {
            success: true,
            data: { yourTurn: isP1, turnTimerSeconds: timerSeconds, waitingForOpponent: false, gameStarted: true },
            messages: [isP1 ? 'Opponent is ready. Your turn — fire!' : 'Enemy ships detected. Waiting for opponent to fire.']
          });
          
          if (isP1) {
            this.navalBattleGateway.startTimer(s as unknown as any, roomId, timerSeconds);
          }
        }
        
        // Lobby update - fetch fully populated room with correct 'started' status
        const populatedStartedRoom = await this.roomModel.findById(startedRoom._id)
          .populate('game_id', '-created_at')
          .populate('players.playerId', 'username')
          .lean();
        if (populatedStartedRoom) {
          const [enriched] = this.localizeRooms([populatedStartedRoom], lang);
          const gameId = (populatedStartedRoom.game_id as any)?._id?.toString() || populatedStartedRoom.game_id?.toString();
          if (gameId) this.roomsGateway.broadcastRoomUpdate(gameId, 'roomUpdated', enriched);
        }
        this.invalidateReadCaches();
      }
    }

    return { success: true, messages: ['Placement saved'], data: { status: placement.status, roomStatus: updatedRoom.status } };
  }

  // ── HELPERS ─────────────────────────────────────────────────────────────────

  private localizeRooms(rooms: any[], lang: string): any[] {
    return rooms.map(room => {
      if (room.game_id?.name) {
        room.game_id = {
          ...room.game_id,
          name: lang === 'es' ? room.game_id.name.es : room.game_id.name.en,
          description: lang === 'es' ? room.game_id.description?.es : room.game_id.description?.en,
        };
        if (room.player_limit) room.game_id.max_players = room.player_limit;
      }
      return room;
    });
  }

  /** Helper to emit to all sockets in a room except those belonging to specific user */
  private async emitToOthers(gateway: any, roomId: string, excludeUserId: string, eventName: string, playerPayload: any, spectatorPayload: any) {
    if (!gateway?.server) return;
    const sockets = await gateway.server.in(roomId).fetchSockets();
    // #region agent log
    agentDebugLog('room.service.ts:emitToOthers', 'emit_to_others', {
      roomId,
      excludeUserId,
      eventName,
      connectedSockets: sockets.length,
      gameEnded: !!playerPayload?.data?.gameEnded,
    }, 'H3');
    // #endregion
    for (const s of sockets) {
      if (s.data?.player_id !== excludeUserId) {
        const isSpectator = (s as any).data?.isSpectator || false;
        s.emit(eventName, isSpectator ? spectatorPayload : playerPayload);
      }
    }
  }

  /** Helper to emit to ALL sockets in a room */
  private async serverBroadcast(roomId: string, payload: any) {
    this.navalBattleGateway.server.to(roomId).emit('naval-battle', payload);
    this.halmaGateway.server.to(roomId).emit('halma', payload);
    this.chessGateway.server.to(roomId).emit('chess', payload);
    this.dominoGateway.server.to(roomId).emit('domino', payload);
    this.unoGateway.server.to(roomId).emit('uno', payload);
    this.connectFourGateway.server.to(roomId).emit('connect-four', payload);
  }

  private invalidateReadCaches(): void {
    this.liveStatsCache.clear();
    this.roomsByGameCache.clear();
    this.roomByIdCache.clear();
    this.roomStatusCache.clear();
    this.activeRoomCache.clear();
  }
}
