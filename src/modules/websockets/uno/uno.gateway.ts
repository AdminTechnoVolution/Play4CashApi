import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  MessageBody, ConnectedSocket, OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit,
} from '@nestjs/websockets';
import { Inject, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { GracePeriodService } from '../../../common/grace-period/grace-period.service';
import { TurnDeadlineService } from '../../../common/turn-deadline/turn-deadline.service';
import { Server, Socket } from 'socket.io';
import { Model, Types } from 'mongoose';
import { applyWsAuth } from '../../../common/guards/ws-auth.middleware';
import { REDIS_CLIENT } from '../../../common/redis/redis.module';
import {
  resolveUnoMatchTarget,
  UNO_MATCH_TARGET_DEFAULT,
  UNO_SOCKET_CODE,
} from '../../../common/constants/uno-game.constants';
import { RoomsGateway } from '../rooms/rooms.gateway';
import { UnoGame, UnoGameDocument } from './schemas/uno-game.schema';
import {
  dealUnoInitialState,
  getNextUnoPlayerIndex,
  activePlayerCount,
  applyPlay,
  applyTakeDrawStack,
  applyDrawOne,
  applyPassTurn,
  applyCallUno,
  applyChallengeUnoMiss,
  sumHandScore,
  UnoEngineState,
  UnoColor,
} from './uno-game.logic';
import { I18nService } from '../../../common/i18n/i18n.service';
import { winnerGrossPayout, winnerDisplayedPrize } from '../../../common/utils/game-prize.util';
import {
  buildFinishedRoomSyncData,
  emitDbOpponentJoinedIfPresent,
  scheduleWaitingRoomReconcile,
} from '../../../common/ws/waiting-room-sync.util';

const turnTimers = new Map<string, ReturnType<typeof setTimeout>>();
const clearTimer = (id: string) => {
  const t = turnTimers.get(id);
  if (t) {
    clearTimeout(t);
    turnTimers.delete(id);
  }
};

/** Seconds between rounds before auto-start kicks in. */
const BETWEEN_ROUNDS_SECONDS = 8;

@WebSocketGateway({ namespace: '/uno', cors: { origin: '*', credentials: true } })
export class UnoGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(UnoGateway.name);
  private usernameCache = new Map<string, string>();

  constructor(
    @InjectModel(UnoGame.name) private readonly unoModel: Model<UnoGameDocument>,
    @InjectModel('Room') private readonly roomModel: Model<any>,
    @InjectModel('User') private readonly userModel: Model<any>,
    private readonly config: ConfigService,
    private readonly roomsGateway: RoomsGateway,
    @Inject(REDIS_CLIENT) private readonly redis: any,
    private readonly i18n: I18nService,
    private readonly grace: GracePeriodService,
    private readonly turnDeadlines: TurnDeadlineService,
  ) {}

  /**
   * Phase B: register the forfeit handler that the global grace-period sweeper will
   * call when a UNO disconnect grace expires. Distributed safe: the sweeper acquires a
   * Mongo lock per row, so the handler runs exactly once across all replicas.
   */
  onModuleInit() {
    this.grace.registerHandler('uno', (playerId, roomId) =>
      this.eliminatePlayer(roomId, playerId, 'forfeit'),
    );
    this.turnDeadlines.registerHandler('uno', (playerId, roomId) =>
      this.eliminatePlayer(roomId, playerId, 'timeout'),
    );
  }

  private async runWithRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    let lastError: any;
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error: any) {
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

  private getLang(client: Socket): string {
    return (client.handshake?.query?.lang as string) || (client.data?.lang as string) || 'en';
  }

  private async getCachedUsername(userId: string): Promise<string> {
    if (this.usernameCache.has(userId)) return this.usernameCache.get(userId)!;
    const user = await this.userModel.findById(userId).select('username').lean();
    const username = user?.username || 'Unknown';
    if (user) this.usernameCache.set(userId, username);
    return username;
  }

  private getHands(game: UnoGameDocument): Map<string, string[]> {
    if (game.hands instanceof Map) return game.hands;
    return new Map(Object.entries((game.hands as any) || {}));
  }

  afterInit(server: Server) {
    applyWsAuth(server, this.config, this.redis);
  }

  handleConnection(client: Socket) {
    this.logger.log(`[UNO] Connected: ${client.id}`);
  }

  async handleDisconnect(client: Socket) {
    clearTimer(client.id);
    const { room_id, player_id } = client.data;
    if (!room_id || !player_id) return;

    const roomObjId = new Types.ObjectId(room_id);
    const playerObjId = new Types.ObjectId(player_id);

    const room = await this.roomModel.findOne({
      _id: roomObjId,
      $or: [{ 'players.playerId': playerObjId }, { spectators: playerObjId }],
    });
    if (!room || room.status === 'finished') return;

    const isSpectator = room.spectators?.some((id: any) => id.toString() === player_id);
    if (isSpectator) {
      const updated = await this.roomModel.findOneAndUpdate(
        { _id: roomObjId },
        { $pull: { spectators: playerObjId } },
        { returnDocument: 'after' },
      );
      client.to(room_id).emit('uno', {
        success: true,
        data: { spectatorsCount: updated?.spectators?.length || 0 },
        messages: [],
      });
      return;
    }

    if (room.status === 'waiting') {
      const updated = await this.roomModel.findOneAndUpdate(
        { _id: roomObjId, 'players.playerId': playerObjId },
        { $pull: { players: { playerId: playerObjId } } },
        { returnDocument: 'after' },
      );
      if (!updated) return;
      const gameIdForLobby = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
      if (updated.players.length === 0) {
        await this.roomModel.findOneAndDelete({ _id: roomObjId, players: { $size: 0 } });
        // Phase D: tell every lobby subscriber that this empty waiting room is gone so
        // their RoomsPage filters it out without polling.
        if (gameIdForLobby) {
          this.roomsGateway.broadcastRoomUpdate(gameIdForLobby, 'roomDeleted', { id: room_id });
        }
      } else {
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
        // Phase D: broadcast the new player count to the lobby so the join button
        // re-enables for other users the moment a seat opens up.
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
        const idsStr = game.player_ids.map((p: any) => p.toString());
        const currentId = idsStr[game.current_player_index];
        if (currentId === player_id) {
          const turnStart = game.turn_start_time?.getTime() ?? Date.now();
          const limit = (room.game_id?.turn_timer_seconds || 30) * 1000;
          remainingTurnSecs = Math.ceil((limit - (Date.now() - turnStart)) / 1000);
        }
      }

      // Phase B: use the distributed grace service. The service clamps to
      // `MIN_GRACE_SECS` (30 s) — so a player who blips out at the very end of a turn
      // still gets the product-minimum window to reconnect, not the previous 5 s.
      await this.grace.start('uno', player_id, room_id, Math.max(60, remainingTurnSecs));
    }
  }

  @SubscribeMessage('join')
  async handleJoin(@ConnectedSocket() client: Socket, @MessageBody() payload: { room_id: string }) {
    const lang = this.getLang(client);
    const player_id = client.data.player_id;
    let room_id = payload?.room_id;

    // Phase B: cancel any open disconnect grace. The Mongo upsert key is
    // (game_name, player_id), so this also covers reconnects from a different device.
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
    if ((room.game_id as any)?.socket_code !== UNO_SOCKET_CODE) {
      return client.emit('uno', {
        success: false,
        messages: ['ws.uno.wrongGame'],
      });
    }
    if (room.status === 'finished') {
      return client.emit('uno', {
        success: true,
        messages: ['ws.games.playerDisconnected'],
        data: buildFinishedRoomSyncData(room, player_id),
      });
    }

    await client.join(room_id);
    client.data.room_id = room_id;

    const game = await this.unoModel.findOne({ room_id: new Types.ObjectId(room_id) });
    const isMember = room.players.some((p: any) => p.playerId.toString() === player_id);
    const isEliminated = game?.eliminated_players?.includes(player_id);
    client.data.isSpectator = !isMember || !!isEliminated;

    const timerSec = (room.game_id as any)?.turn_timer_seconds ?? 45;
    const maxPlayers = room.player_limit || (room.game_id as any)?.max_players || 10;

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

    const playerIndex = room.players.findIndex((p: any) => p.playerId.toString() === player_id);
    client.data.playerNum = playerIndex + 1;

    if (room.status === 'started' && game) {
      await this.emitUnoStateToClient(client, room, game, timerSec, lang);
      return;
    }

    client.emit('uno', {
      success: true,
      data: {
        waitingForOpponent: true,
        isPlayerOne: playerIndex === 0,
        playersJoined: room.players.length,
        maxPlayers,
        isSpectator: false,
      },
      messages: ['ws.games.waitingOpponent'],
    });

    await emitDbOpponentJoinedIfPresent({
      room,
      joiningPlayerId: player_id,
      getUsername: (id) => this.getCachedUsername(id),
      notifyJoiner: (opponentName) => {
        client.emit('uno', {
          success: true,
          data: {
            opponentJoined: true,
            opponentName,
            waitingForOpponent: true,
            playersJoined: room.players.length,
            maxPlayers,
          },
          messages: ['ws.games.opponentJoined'],
        });
      },
      notifyOthers: (joinerName) => {
        client.to(room_id).emit('uno', {
          success: true,
          data: {
            opponentJoined: true,
            opponentName: joinerName,
            waitingForOpponent: true,
            playersJoined: room.players.length,
            maxPlayers,
          },
          messages: ['ws.games.opponentJoined'],
        });
      },
    });

    if (room.players.length >= maxPlayers && room.status === 'waiting') {
      await this.tryStartUnoGame(room_id, lang);
    }
    scheduleWaitingRoomReconcile(room_id, () => this.tryStartUnoGame(room_id, lang));
  }

  /** Idempotent start when the room is full and still waiting */
  private async tryStartUnoGame(room_id: string, lang: string) {
    // Phase C: gate on the persisted player count, not the socket count. A single
    // user opening multiple tabs can satisfy `socketsInRoom.length >= maxPlayers`
    // even though only one slot is actually filled in `room.players`. Without this
    // guard, `playerIds.map(...)` below included `undefined` entries which then
    // either tried to deduct from a non-existent user or produced a corrupt game.
    const preRoom = await this.roomModel.findById(room_id).populate('game_id', 'max_players uno_match_target');
    if (!preRoom) return;
    const expectedPlayers = preRoom.player_limit || (preRoom.game_id as any)?.max_players || 0;
    if (
      expectedPlayers === 0 ||
      preRoom.players.length < expectedPlayers ||
      preRoom.players.some((p: any) => !p?.playerId)
    ) {
      this.logger.warn(
        `event=uno_start_aborted room=${room_id} reason=not_enough_distinct_players players=${preRoom.players.length} expected=${expectedPlayers}`,
      );
      return;
    }

    const started = await this.roomModel.findOneAndUpdate(
      { _id: room_id, status: 'waiting' },
      { $set: { status: 'started' } },
      { returnDocument: 'after' },
    );
    if (!started) return;

    const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds max_players uno_match_target');
    if (!room) return;

    const playerIds = room.players.map((p: any) => p.playerId);
    const paid: Types.ObjectId[] = [];
    let allPaid = true;
    for (const pid of playerIds) {
      const deducted = await this.userModel.findOneAndUpdate(
        { _id: pid, balance: { $gte: room.bet_amount } },
        { $inc: { balance: -room.bet_amount } },
        { returnDocument: 'after' },
      );
      if (!deducted) {
        allPaid = false;
        break;
      }
      paid.push(pid);
    }
    if (!allPaid) {
      for (const pid of paid) await this.userModel.updateOne({ _id: pid }, { $inc: { balance: room.bet_amount } });
      await this.roomModel.findByIdAndUpdate(room_id, { $set: { status: 'waiting' } });
      this.server.to(room_id).emit('uno', {
        success: false,
        messages: ['ws.games.insufficientBalance'],
      });
      return;
    }

    /**
     * Single compensating action. Refunds every paid player, reverts room status to
     * waiting, deletes any partial game document, and notifies the room. Called from
     * every failure branch below so we never leave players charged without a game.
     */
    const compensate = async (reason: string, errKey: string) => {
      this.logger.error(`event=uno_start_failed room=${room_id} reason=${reason}`);
      for (const pid of paid) {
        await this.userModel
          .updateOne({ _id: pid }, { $inc: { balance: room.bet_amount } })
          .catch((e) => this.logger.error(`[UNO] Refund failed | player=${pid}`, e));
      }
      await this.unoModel
        .deleteOne({ room_id: new Types.ObjectId(room_id) })
        .catch((e) => this.logger.error(`[UNO] Game cleanup failed | room=${room_id}`, e));
      await this.roomModel
        .findByIdAndUpdate(room_id, { $set: { status: 'waiting' } })
        .catch((e) => this.logger.error(`[UNO] Room status reset failed | room=${room_id}`, e));
      this.server.to(room_id).emit('uno', {
        success: false,
        messages: [errKey],
      });
    };

    const playerIdStrs = playerIds.map((p: any) => p.toString());
    let deal;
    try {
      deal = dealUnoInitialState(playerIdStrs);
    } catch (e) {
      this.logger.error(`[UNO] Deal failed | room=${room_id}`, e);
      await compensate('deal_failed', 'ws.games.matchmakingError');
      return;
    }

    const matchTarget = resolveUnoMatchTarget(
      (room.game_id as any)?.uno_match_target,
      this.config.get<string>('UNO_MATCH_TARGET'),
    );
    const initialScores: Record<string, number> = {};
    for (const id of playerIdStrs) initialScores[id] = 0;

    let game;
    try {
      game = await this.unoModel.create({
        room_id: new Types.ObjectId(room_id),
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
    } catch (e) {
      this.logger.error(`[UNO] Game create failed | room=${room_id}`, e);
      await compensate('game_create_failed', 'ws.games.matchmakingError');
      return;
    }

    if (!game) {
      // Defensive: `create()` returned without throwing but produced no doc (driver edge).
      await compensate('game_create_returned_null', 'ws.games.matchmakingError');
      return;
    }

    const timerSec = (room.game_id as any)?.turn_timer_seconds ?? 45;
    const sockets = await this.server.in(room_id).fetchSockets();
    const currentTurnId = playerIdStrs[game.current_player_index];
    const currentTurnUsername = await this.getCachedUsername(currentTurnId);

    for (const s of sockets) {
      const pid = (s as any).data.player_id;
      const sLang = this.getLang(s as unknown as Socket);
      const isSpectator = (s as any).data.isSpectator || false;
      const isMyTurn = !isSpectator && pid === currentTurnId;
      const data = await this.buildUnoPayloadSync(game, room, pid, isSpectator, timerSec, currentTurnUsername);
      (s as unknown as Socket).emit('uno', {
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
      if (isMyTurn) this.startTimer(s as unknown as Socket, room_id, timerSec);
    }

    const gId = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
    const populated = await this.roomModel.findById(room_id).populate('game_id', '-created_at').populate('players.playerId', 'username').lean();
    if (gId) this.roomsGateway.broadcastRoomUpdate(gId, 'roomUpdated', populated);
  }

  @SubscribeMessage('sync')
  async handleSync(@ConnectedSocket() client: Socket, @MessageBody() payload: { room_id?: string }) {
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
    const game = await this.unoModel.findOne({ room_id: new Types.ObjectId(room_id) });
    if (!game || room.status !== 'started') {
      return client.emit('uno', { success: false, messages: ['ws.games.roomInactive'] });
    }

    const timerSec = (room.game_id as any)?.turn_timer_seconds ?? 45;
    await this.emitUnoStateToClient(client, room, game, timerSec, lang);
  }

  @SubscribeMessage('play_card')
  async handlePlayCard(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: { room_id?: string; card_index: number; chosen_color?: string; call_uno?: boolean },
  ) {
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

    let chosen: UnoColor | undefined;
    if (payload.chosen_color) {
      const c = String(payload.chosen_color).toUpperCase();
      if (!['R', 'G', 'B', 'Y'].includes(c)) {
        return client.emit('uno', { success: false, messages: ['ws.uno.chosenColorRequired'] });
      }
      chosen = c as UnoColor;
    }

    const callUno = payload?.call_uno === true;

    await this.runWithRetry(async () => {
      const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds max_players');
      if (!room || room.status !== 'started') {
        return client.emit('uno', { success: false, messages: ['ws.games.roomInactive'] });
      }
      const game = await this.unoModel.findOne({ room_id: new Types.ObjectId(room_id) });
      if (!game) {
        return client.emit('uno', { success: false, messages: ['ws.games.gameNotFound'] });
      }

      const engine = this.gameToEngine(game);
      let nextState: UnoEngineState;
      let winnerId: string | undefined;
      try {
        const r = applyPlay(engine, player_id, cardIndex, { chosenColor: chosen, callUno });
        nextState = r.state;
        winnerId = r.winnerId;
      } catch (e: any) {
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

  @SubscribeMessage('call_uno')
  async handleCallUno(@ConnectedSocket() client: Socket, @MessageBody() payload: { room_id?: string }) {
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
      const game = await this.unoModel.findOne({ room_id: new Types.ObjectId(room_id) });
      if (!game) {
        return client.emit('uno', { success: false, messages: ['ws.games.gameNotFound'] });
      }

      const engine = this.gameToEngine(game);
      let nextState: UnoEngineState;
      try {
        nextState = applyCallUno(engine, player_id);
      } catch (e: any) {
        const key = this.unoReasonToMessageKey(e?.message || '');
        return client.emit('uno', { success: false, messages: [key] });
      }

      this.applyEngineToGameNoTurnReset(game, nextState);
      await game.save();
      await this.broadcastUnoGameState(room_id, room, game, { unoCallerId: player_id });
    });
  }

  @SubscribeMessage('challenge_uno_miss')
  async handleChallengeUnoMiss(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { room_id?: string; offender_id: string },
  ) {
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
      const game = await this.unoModel.findOne({ room_id: new Types.ObjectId(room_id) });
      if (!game) {
        return client.emit('uno', { success: false, messages: ['ws.games.gameNotFound'] });
      }

      const engine = this.gameToEngine(game);
      let nextState: UnoEngineState;
      let success: boolean;
      try {
        const r = applyChallengeUnoMiss(engine, player_id, offender_id);
        nextState = r.state;
        success = r.success;
      } catch (e: any) {
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

  /**
   * Player taps "ready" on the between-rounds scoreboard. When every active player has
   * sent it, the next round starts immediately (skipping the auto-start countdown).
   */
  @SubscribeMessage('start_next_round')
  async handleStartNextRound(@ConnectedSocket() client: Socket, @MessageBody() payload: { room_id?: string }) {
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
      const game = await this.unoModel.findOne({ room_id: new Types.ObjectId(room_id) });
      if (!game || !game.between_rounds || game.match_winner_id) return;

      const ready = new Set([...(game.players_ready_for_next || []), player_id]);
      const eligible = (game.player_ids as any[])
        .map((p) => p.toString())
        .filter((id) => !(game.eliminated_players || []).includes(id));
      game.players_ready_for_next = Array.from(ready);
      game.markModified('players_ready_for_next');
      await game.save();

      everyoneReady = eligible.every((id) => ready.has(id));
    });

    if (everyoneReady) {
      await this.startNextRound(room_id, /* triggeredByReady */ true);
    } else {
      // Re-broadcast the scoreboard so the UI can show the new "ready" tick on this seat.
      const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds max_players');
      const game = await this.unoModel.findOne({ room_id: new Types.ObjectId(room_id) });
      if (room && game) {
        const winnerEntry = (game.round_history || [])[game.round_history?.length - 1 || 0];
        if (winnerEntry) {
          await this.broadcastRoundEnd(room_id, room, game, winnerEntry.winnerId, winnerEntry.scoreDealt);
        }
      }
    }
  }

  @SubscribeMessage('take_draw_stack')
  async handleTakeDrawStack(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { room_id?: string },
  ) {
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
      const game = await this.unoModel.findOne({ room_id: new Types.ObjectId(room_id) });
      if (!game) {
        return client.emit('uno', { success: false, messages: ['ws.games.gameNotFound'] });
      }

      const engine = this.gameToEngine(game);
      let nextState: UnoEngineState;
      try {
        nextState = applyTakeDrawStack(engine, player_id).state;
      } catch (e: any) {
        const key = this.unoReasonToMessageKey(e?.message || '');
        return client.emit('uno', { success: false, messages: [key] });
      }

      this.applyEngineToGame(game, nextState);
      await game.save();
      await this.broadcastUnoGameState(room_id, room, game);
    });
  }

  @SubscribeMessage('draw_one')
  async handleDrawOne(@ConnectedSocket() client: Socket, @MessageBody() payload: { room_id?: string }) {
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
      const game = await this.unoModel.findOne({ room_id: new Types.ObjectId(room_id) });
      if (!game) {
        return client.emit('uno', { success: false, messages: ['ws.games.gameNotFound'] });
      }

      const engine = this.gameToEngine(game);
      let nextState: UnoEngineState;
      try {
        nextState = applyDrawOne(engine, player_id).state;
      } catch (e: any) {
        const key = this.unoReasonToMessageKey(e?.message || '');
        return client.emit('uno', { success: false, messages: [key] });
      }

      this.applyEngineToGame(game, nextState);
      await game.save();
      await this.broadcastUnoGameState(room_id, room, game);
    });
  }

  @SubscribeMessage('pass')
  async handlePass(@ConnectedSocket() client: Socket, @MessageBody() payload: { room_id?: string }) {
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
      const game = await this.unoModel.findOne({ room_id: new Types.ObjectId(room_id) });
      if (!game) {
        return client.emit('uno', { success: false, messages: ['ws.games.gameNotFound'] });
      }

      const engine = this.gameToEngine(game);
      let nextState: UnoEngineState;
      try {
        nextState = applyPassTurn(engine, player_id);
      } catch (e: any) {
        const key = this.unoReasonToMessageKey(e?.message || '');
        return client.emit('uno', { success: false, messages: [key] });
      }

      this.applyEngineToGame(game, nextState);
      await game.save();
      await this.broadcastUnoGameState(room_id, room, game);
    });
  }

  private gameToEngine(game: UnoGameDocument): UnoEngineState {
    const h = this.getHands(game);
    const handsObj: Record<string, string[]> = {};
    for (const id of game.player_ids) {
      const sid = id.toString();
      handsObj[sid] = [...(h.get(sid) || [])];
    }
    return {
      playerIds: game.player_ids.map((p: any) => p.toString()),
      hands: handsObj,
      drawPile: [...game.draw_pile],
      discardPile: [...game.discard_pile],
      currentPlayerIndex: game.current_player_index,
      direction: game.direction as 1 | -1,
      currentColor: game.current_color as UnoColor,
      drawStackPending: game.draw_stack_pending ?? 0,
      eliminatedPlayers: [...(game.eliminated_players || [])],
      unoCalled: [...(game.uno_called || [])],
      pendingUnoOffender: game.pending_uno_offender ?? null,
      lastActionPlayerId: game.last_action_player_id ?? null,
    };
  }

  private applyEngineToGame(game: UnoGameDocument, eng: UnoEngineState): void {
    this.copyEngineFields(game, eng);
    game.turn_start_time = new Date();
  }

  /** Same as `applyEngineToGame` but doesn't reset the turn timer. Used for UNO-call /
   *  challenge events that don't end the current turn. */
  private applyEngineToGameNoTurnReset(game: UnoGameDocument, eng: UnoEngineState): void {
    this.copyEngineFields(game, eng);
  }

  private copyEngineFields(game: UnoGameDocument, eng: UnoEngineState): void {
    const m = new Map<string, string[]>();
    for (const [k, v] of Object.entries(eng.hands)) m.set(k, [...v]);
    game.hands = m as any;
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

  private unoReasonToMessageKey(reason: string): string {
    const map: Record<string, string> = {
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

  private async clearTimersInRoom(room_id: string): Promise<void> {
    const sockets = await this.server.in(room_id).fetchSockets();
    for (const s of sockets) clearTimer(s.id);
  }

  /** Reconcile `socket.data.isSpectator` with per-round eliminations (timeout is round-scoped). */
  private refreshMemberSpectatorFlags(
    game: UnoGameDocument,
    sockets: Awaited<ReturnType<ReturnType<Server['in']>['fetchSockets']>>,
  ): void {
    const eliminated = new Set((game.eliminated_players || []).map(String));
    const memberIds = new Set(game.player_ids.map((p: any) => p.toString()));
    for (const s of sockets) {
      const pid = (s as any).data?.player_id as string | undefined;
      if (!pid || !memberIds.has(pid)) continue;
      (s as any).data.isSpectator = eliminated.has(pid);
    }
  }

  private async broadcastUnoGameState(
    room_id: string,
    room: any,
    game: UnoGameDocument,
    extras?: {
      unoCallerId?: string;
      challenge?: { accuserId: string; accuserName: string; offenderId: string; offenderName: string };
    },
    roundStartExtras?: { message: string; roundNumber: number },
  ): Promise<void> {
    // UNO-call / challenge events do not change whose turn it is, so we only reset the
    // turn timer when the underlying action advanced the play.
    const turnRelated = !extras?.unoCallerId && !extras?.challenge;
    if (turnRelated) await this.clearTimersInRoom(room_id);

    const timerSec = (room.game_id as any)?.turn_timer_seconds ?? 45;
    const idsStr = game.player_ids.map((p: any) => p.toString());
    const currentTurnId = idsStr[game.current_player_index];
    const currentTurnUsername = await this.getCachedUsername(currentTurnId);
    const sockets = await this.server.in(room_id).fetchSockets();
    this.refreshMemberSpectatorFlags(game, sockets);

    let unoCallerName = '';
    if (extras?.unoCallerId) unoCallerName = await this.getCachedUsername(extras.unoCallerId);

    for (const s of sockets) {
      const pid = (s as any).data.player_id;
      const sLang = this.getLang(s as unknown as Socket);
      const sSpectator = (s as any).data.isSpectator || false;
      const payload = await this.buildUnoPayloadSync(game, room, pid, sSpectator, timerSec, currentTurnUsername);
      const isMyTurn = !sSpectator && pid === currentTurnId;

      let extraData: Record<string, unknown> = {};
      let primaryMsg: string;
      if (extras?.unoCallerId) {
        extraData = { unoCalled: true, unoCallerId: extras.unoCallerId, unoCallerName };
        primaryMsg =
          pid === extras.unoCallerId ? 'ws.uno.youCalledUno' : 'ws.uno.playerCalledUno';
        if (pid !== extras.unoCallerId) {
          extraData.unoCallerName = unoCallerName;
        }
      } else if (extras?.challenge) {
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
      } else if (roundStartExtras) {
        extraData = { roundStarted: true, roundNumber: roundStartExtras.roundNumber };
        primaryMsg = roundStartExtras.message;
      } else {
        primaryMsg = isMyTurn ? 'ws.games.yourTurn' : 'ws.uno.stateUpdated';
      }

      (s as unknown as Socket).emit('uno', {
        success: true,
        data: { ...payload, ...extraData, gameStarted: true },
        messages: [primaryMsg],
      });
      if (turnRelated && isMyTurn) this.startTimer(s as unknown as Socket, room_id, timerSec);
    }
  }

  /**
   * Called when a hand ends. Awards round points to `winnerId` (Mattel: sum of every other
   * active player's remaining card values), updates `match_scores`, then either:
   *   - **Match end**: a player reached `match_target_score`. Performs the payout, marks
   *     the room finished, and broadcasts the `gameEnded` payload (Phase 1 behavior).
   *   - **Round end**: nobody hit the target. Sets `between_rounds=true`, schedules the
   *     auto-start timer, and broadcasts a scoreboard payload. Players can tap "ready"
   *     via `start_next_round` to skip the wait.
   */
  private async finalizeUnoRoundWinner(
    room_id: string,
    room: any,
    game: UnoGameDocument,
    winnerId: string,
  ): Promise<void> {
    await this.clearTimersInRoom(room_id);

    // ── Score the round ────────────────────────────────────────────────────
    const idsStr = game.player_ids.map((p: any) => p.toString());
    const hands = this.getHands(game);
    let scoreDealt = 0;
    for (const id of idsStr) {
      if (id === winnerId) continue;
      scoreDealt += sumHandScore(hands.get(id) || []);
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

    // ── Round ends, match continues ────────────────────────────────────────
    game.between_rounds = true;
    game.between_rounds_processing = false;
    // Timeout/forfeit eliminations are per-round only — everyone re-enters next deal.
    game.eliminated_players = [];
    game.markModified('eliminated_players');
    const deadline = new Date(Date.now() + BETWEEN_ROUNDS_SECONDS * 1000);
    game.next_round_starts_at = deadline;
    game.players_ready_for_next = [];
    await game.save();

    this.logger.log(
      `event=uno_round_end room=${room_id} winner=${winnerId} score=${scoreDealt} round=${game.round_number} next_deadline=${deadline.toISOString()}`,
    );

    // No in-process timer — `processBetweenRoundsTimeouts` cron polls the deadline.
    await this.broadcastRoundEnd(room_id, room, game, winnerId, scoreDealt);
  }

  /** Match-final payout. Same behavior as Phase 1's `finalizeUnoRoundWinner`. */
  private async finalizeMatchEnd(
    room_id: string,
    room: any,
    game: UnoGameDocument,
    winnerId: string,
  ): Promise<void> {
    this.logger.log(`event=uno_match_end room=${room_id} winner=${winnerId} round=${game.round_number}`);
    room.status = 'finished';
    room.winner = new Types.ObjectId(winnerId);
    room.winner_reason = 'win';
    room.finished_at = new Date();
    const grossPayout = winnerGrossPayout(room.bet_amount, room.house_edge, room.players.length);
    await this.userModel.updateOne({ _id: winnerId }, { $inc: { balance: grossPayout } });
    game.match_winner_id = winnerId;
    game.between_rounds = false;
    game.next_round_starts_at = null;
    await game.save();
    await room.save();

    const gameId = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
    if (gameId) this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });

    const timerSec = (room.game_id as any)?.turn_timer_seconds ?? 45;
    const currentTurnUsername = await this.getCachedUsername(winnerId);
    const sockets = await this.server.in(room_id).fetchSockets();
    const displayPrize = winnerDisplayedPrize(room.bet_amount, room.house_edge, room.players.length);

    for (const s of sockets) {
      const pid = (s as any).data.player_id;
      const sLang = this.getLang(s as unknown as Socket);
      const sSpectator = (s as any).data.isSpectator || false;
      const payload = await this.buildUnoPayloadSync(game, room, pid, sSpectator, timerSec, currentTurnUsername);
      const isWinner = !sSpectator && pid === winnerId;
      (s as unknown as Socket).emit('uno', {
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

  /** Emits a between-rounds scoreboard payload to every socket in the room. */
  private async broadcastRoundEnd(
    room_id: string,
    room: any,
    game: UnoGameDocument,
    winnerId: string,
    scoreDealt: number,
  ): Promise<void> {
    const winnerName = await this.getCachedUsername(winnerId);
    const timerSec = (room.game_id as any)?.turn_timer_seconds ?? 45;
    const sockets = await this.server.in(room_id).fetchSockets();
    this.refreshMemberSpectatorFlags(game, sockets);
    for (const s of sockets) {
      const pid = (s as any).data.player_id;
      const sLang = this.getLang(s as unknown as Socket);
      const sSpectator = (s as any).data.isSpectator || false;
      const payload = await this.buildUnoPayloadSync(game, room, pid, sSpectator, timerSec, winnerName);
      const wonRound = !sSpectator && pid === winnerId;
      (s as unknown as Socket).emit('uno', {
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

  /**
   * Deal a fresh round and broadcast the new state.
   *
   * **Multi-instance safe.** Callers do not need to coordinate — this method uses
   * `findOneAndUpdate` to atomically grab the between-rounds lock for the given room.
   * The first replica to win the update performs the deal and the broadcast; any
   * concurrent caller (other replica's cron tick, late "ready" vote racing the timer)
   * gets `null` from the findOneAndUpdate and exits early.
   *
   * Called from:
   *   - `handleStartNextRound` when every active player has tapped "ready"
   *   - `processBetweenRoundsTimeouts` when the auto-start deadline expires
   */
  private async startNextRound(room_id: string, triggeredByReady: boolean): Promise<void> {
    // Atomic lock acquisition — only one replica/caller wins.
    const game = await this.unoModel.findOneAndUpdate(
      {
        room_id: new Types.ObjectId(room_id),
        between_rounds: true,
        between_rounds_processing: false,
        match_winner_id: null,
      },
      { $set: { between_rounds_processing: true } },
      { returnDocument: 'after' },
    );
    if (!game) {
      // Someone else already dispatched (or match already ended).
      return;
    }

    try {
      const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds max_players');
      if (!room || room.status !== 'started') {
        await this.unoModel.updateOne(
          { _id: game._id },
          { $set: { between_rounds_processing: false } },
        );
        return;
      }

      const playerIdStrs = game.player_ids.map((p: any) => p.toString());
      let deal;
      try {
        deal = dealUnoInitialState(playerIdStrs);
      } catch (e) {
        this.logger.error(`[UNO] Re-deal failed | room=${room_id}`, e);
        // Release the lock so another tick can retry.
        await this.unoModel.updateOne(
          { _id: game._id },
          { $set: { between_rounds_processing: false } },
        );
        return;
      }

      const handsMap = new Map<string, string[]>();
      for (const id of playerIdStrs) handsMap.set(id, [...(deal.hands[id] || [])]);
      game.hands = handsMap as any;
      game.draw_pile = deal.drawPile;
      game.discard_pile = deal.discardPile;
      game.current_player_index = 0;
      game.direction = 1;
      game.current_color = deal.currentColor;
      game.draw_stack_pending = 0;
      // Match-level fields persist; per-round fields reset.
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

      this.logger.log(
        `event=uno_round_auto_start room=${room_id} round=${game.round_number} trigger=${
          triggeredByReady ? 'ready' : 'timer'
        }`,
      );

      await this.broadcastUnoGameState(room_id, room, game, undefined, {
        message: triggeredByReady ? 'ws.uno.nextRoundStartedReady' : 'ws.uno.nextRoundStarted',
        roundNumber: game.round_number,
      });
    } catch (err) {
      // Defensive: never leave a room stuck with the lock held.
      this.logger.error(`[UNO] startNextRound failed | room=${room_id}`, err);
      await this.unoModel
        .updateOne({ _id: game._id }, { $set: { between_rounds_processing: false } })
        .catch(() => {});
    }
  }

  /**
   * Cron tick. Every second, sweep games whose `between_rounds` deadline has passed and
   * deal the next hand. The atomic lock inside `startNextRound` makes this safe to run
   * on every replica concurrently — only one will dispatch each game.
   *
   * Inactive-room protection: `room.status` is checked inside `startNextRound`, so an
   * abandoned room never re-deals.
   */
  @Cron(CronExpression.EVERY_SECOND)
  async processBetweenRoundsTimeouts(): Promise<void> {
    let expired: { room_id: Types.ObjectId }[] = [];
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
    } catch (err) {
      this.logger.error('[UNO] Scheduler poll failed', err);
      return;
    }

    if (expired.length === 0) return;

    for (const g of expired) {
      try {
        await this.startNextRound(g.room_id.toString(), /* triggeredByReady */ false);
      } catch (err) {
        this.logger.error(`[UNO] Scheduler dispatch failed | room=${g.room_id}`, err);
      }
    }
  }

  private getMatchScoresMap(game: UnoGameDocument): Map<string, number> {
    if (game.match_scores instanceof Map) return new Map(game.match_scores);
    return new Map(Object.entries((game.match_scores as any) || {}).map(([k, v]) => [k, Number(v) || 0]));
  }

  /**
   * Resend the current state to a single client. Used on (re)connect and during
   * reconnect mid-match. If the room is in `between_rounds`, augments the payload
   * with the round-end metadata so the PWA can render the scoreboard with an accurate
   * countdown instead of an empty board.
   */
  private async emitUnoStateToClient(client: Socket, room: any, game: UnoGameDocument, timerSec: number, lang: string) {
    const player_id = client.data.player_id;
    const isSpectator = client.data.isSpectator || false;
    const idsStr = game.player_ids.map((p: any) => p.toString());
    const currentTurnId = idsStr[game.current_player_index];
    const currentTurnUsername = await this.getCachedUsername(currentTurnId);

    // Phase B: compute the remaining turn time so the reconnecting client sees an
    // accurate countdown and the server arms a fresh turn timer for the active
    // player. Previously this method emitted the full `timerSec` and never called
    // `startTimer`, so a reconnected player could sit idle forever without
    // triggering a server-side timeout.
    let remainingTurnSecs = timerSec;
    if (game.turn_start_time && !game.between_rounds && !game.match_winner_id) {
      const elapsed = (Date.now() - new Date(game.turn_start_time).getTime()) / 1000;
      remainingTurnSecs = Math.max(5, Math.ceil(timerSec - elapsed));
    }

    const payload = await this.buildUnoPayloadSync(game, room, player_id, isSpectator, remainingTurnSecs, currentTurnUsername);

    let messages: string[] = [];
    let extra: Record<string, unknown> = {};

    if (game.between_rounds && !game.match_winner_id) {
      // Reconstruct round-end context from the audit log so the scoreboard shows the
      // same "Alice won (+35)" header the player would have seen if they were online.
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
    } else if (game.match_winner_id) {
      // Reconnect after match end — surface the final scoreboard immediately.
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

    // Arm a fresh turn timer on the server if the reconnected client owns the
    // current turn and the match is actively in play.
    const isMyTurn = !isSpectator && player_id === currentTurnId;
    if (isMyTurn && !game.between_rounds && !game.match_winner_id) {
      this.startTimer(client, (room?._id ?? room?.id ?? '').toString() || client.data.room_id, remainingTurnSecs);
    }
  }

  private async buildUnoPayloadSync(
    game: UnoGameDocument,
    room: any,
    viewerPlayerId: string,
    isSpectator: boolean,
    timerSec: number,
    currentTurnUsername: string,
  ) {
    const hands = this.getHands(game);
    const idsStr = game.player_ids.map((p: any) => p.toString());
    const handCount: Record<string, number> = {};
    for (const id of idsStr) {
      handCount[id] = (hands.get(id) || []).length;
    }
    const topDiscard = game.discard_pile?.length ? game.discard_pile[game.discard_pile.length - 1] : null;
    const currentTurnId = idsStr[game.current_player_index];
    const yourTurn = !isSpectator && currentTurnId === viewerPlayerId;
    const usernames: Record<string, string> = {};
    for (const id of idsStr) {
      usernames[id] = await this.getCachedUsername(id);
    }
    const lastActionId = game.last_action_player_id ?? null;
    const lastActionUsername = lastActionId ? await this.getCachedUsername(lastActionId) : null;

    const scoresMap = this.getMatchScoresMap(game);
    const matchScores: Record<string, number> = {};
    for (const id of idsStr) matchScores[id] = scoresMap.get(id) ?? 0;

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
      // Multi-round (Phase 2)
      matchScores,
      roundNumber: game.round_number ?? 1,
      matchTargetScore: game.match_target_score ?? UNO_MATCH_TARGET_DEFAULT,
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

  private startTimer(socket: Socket, room_id: string, seconds: number) {
    const player_id = socket.data?.player_id;
    if (!player_id) return;
    clearTimer(socket.id);
    void this.turnDeadlines.schedule('uno', room_id, player_id, seconds);
    const t = setTimeout(async () => {
      const game = await this.unoModel.findOne({ room_id: new Types.ObjectId(room_id) });
      if (!game) return;
      const room = await this.roomModel.findById(room_id);
      if (!room || room.status !== 'started') return;
      const idsStr = game.player_ids.map((p: any) => p.toString());
      if (idsStr[game.current_player_index] !== player_id) return;

      const eliminated = game.eliminated_players || [];
      const remainingAfterTimeout = activePlayerCount(idsStr, [...eliminated, player_id]);
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
      } else {
        // Out for this round only; stay in the room to see scoreboard / next deal.
        socket.data.isSpectator = true;
      }
    }, seconds * 1000);
    turnTimers.set(socket.id, t);
  }

  public async eliminatePlayer(room_id: string, player_id: string, reason: 'forfeit' | 'timeout') {
    await this.runWithRetry(async () => {
      await this.redis.del(`grace_period:uno:${player_id}`);

      const game = await this.unoModel.findOne({ room_id: new Types.ObjectId(room_id) });
      if (!game) return;
      const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds');
      if (!room || room.status !== 'started') return;

      const idsStr = game.player_ids.map((p: any) => p.toString());
      const eliminated = game.eliminated_players || [];
      if (eliminated.includes(player_id)) return;

      const hands = this.getHands(game);
      const hand = hands.get(player_id) || [];
      if (hand.length > 0) {
        game.draw_pile = [...game.draw_pile, ...hand];
        hands.set(player_id, []);
      }

      const newEliminated = [...eliminated, player_id];
      game.eliminated_players = newEliminated;

      if (idsStr[game.current_player_index] === player_id) {
        game.current_player_index = getNextUnoPlayerIndex(
          game.current_player_index,
          idsStr,
          newEliminated,
          game.direction as 1 | -1,
        );
        game.turn_start_time = new Date();
      }

      const remaining = activePlayerCount(idsStr, newEliminated);
      let winnerId: string | undefined;
      if (remaining <= 1) {
        winnerId = idsStr.find((id) => !newEliminated.includes(id));
        room.status = 'finished';
        room.winner_reason = reason;
        room.finished_at = new Date();
        if (winnerId) {
          room.winner = new Types.ObjectId(winnerId);
          const grossPayout = winnerGrossPayout(room.bet_amount, room.house_edge, room.players.length);
          await this.userModel.updateOne({ _id: winnerId }, { $inc: { balance: grossPayout } });
          // Surface match-end state to the schema so reconnecting clients see the right
          // payload (Phase 3 forfeit policy: any disconnect that leaves a sole survivor
          // ends the entire match, not just the round).
          game.match_winner_id = winnerId;
        }
        game.between_rounds = false;
        game.between_rounds_processing = false;
        game.next_round_starts_at = null;
        await room.save();
        const gameId = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
        if (gameId) this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
        this.logger.log(
          `event=uno_match_end_forfeit room=${room_id} winner=${winnerId ?? 'none'} reason=${reason}`,
        );
      } else {
        await room.save();
      }

      game.hands = hands as any;
      game.markModified('hands');
      game.markModified('draw_pile');
      game.markModified('eliminated_players');
      await game.save();

      const sockets = await this.server.in(room_id).fetchSockets();
      const nextId = idsStr[game.current_player_index];
      const nextUsername = await this.getCachedUsername(nextId);
      const timerSec = (room.game_id as any)?.turn_timer_seconds ?? 45;
      const finished = remaining <= 1;

      for (const s of sockets) {
        const pid = (s as any).data.player_id;
        const sLang = this.getLang(s as unknown as Socket);
        const sSpectator = (s as any).data.isSpectator || false;
        const payload = await this.buildUnoPayloadSync(game, room, pid, sSpectator, timerSec, nextUsername);
        const isWinner = !sSpectator && finished && winnerId && pid === winnerId;
        const prize =
          isWinner && winnerId
            ? winnerDisplayedPrize(room.bet_amount, room.house_edge, room.players.length)
            : 0;

        let msg: string;
        if (finished) {
          msg = isWinner ? 'ws.games.win' : 'ws.games.gameOver';
        } else {
          msg = 'ws.domino.playerEliminated';
        }

        (s as unknown as Socket).emit('uno', {
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
          this.startTimer(s as unknown as Socket, room_id, timerSec);
        }
      }
    });
  }
}
