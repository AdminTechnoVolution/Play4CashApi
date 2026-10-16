import { ReliableDisconnectAction, registerReliableDisconnectHandler } from '../../../common/reliable-commands/reliable-commands';
import { durableEmit, ReliableAction, ReliableInternalAction, ReliableReadAction } from '../../../common/reliable-commands/reliable-commands';
import { gameFinancialUpdate } from '../../payments/game-finance';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Inject, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { GracePeriodService } from '../../../common/grace-period/grace-period.service';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { Model, Types } from 'mongoose';
import { buildWebSocketCorsOptions } from '../../../common/cors/origin-policy';
import { applyWsAuth } from '../../../common/guards/ws-auth.middleware';
import { REDIS_CLIENT } from '../../../common/redis/redis.module';
import { RoomsGateway } from '../rooms/rooms.gateway';
import { ConnectFourGame, ConnectFourGameDocument } from './schemas/connect-four-game.schema';
import { I18nService } from '../../../common/i18n/i18n.service';
import { calculateWinnerSettlement, winnerDisplayedPrize, winnerBalanceUpdate } from '../../../common/utils/game-prize.util';
import { TournamentMatchService } from '../../tournament/services/tournament-match.service';
import {
  coerceConnectFourBoard,
  colorForPlayerNum,
  createEmptyBoard,
  dropDisc,
  playerNumForColor,
  type ConnectFourBoard,
  type ConnectFourColor,
} from './connect-four-game.logic';
import { TurnDeadlineService } from '../../../common/turn-deadline/turn-deadline.service';
import {
  bumpGameStateVersion,
  computeTurnDeadlineAt,
  enrichGamePayload,
} from '../../../common/utils/game-state-version.util';
import {
  agentDebugLog,
  buildFinishedRoomSyncData,
  emitDbOpponentJoinedIfPresent,
  initialTurnDeadlineSeconds,
  scheduleWaitingRoomReconcile,
} from '../../../common/ws/waiting-room-sync.util';
import { acquireGameStartLease, publishGameStarted, releaseGameStartLease } from '../../../common/ws/game-start-coordinator';
import { recordGameAuditAction } from '../../../common/game-audit-evidence.util';

const EVENT = 'connect-four';

const turnTimers = new Map<string, ReturnType<typeof setTimeout>>();
const clearTimer = (id: string) => {
  const t = turnTimers.get(id);
  if (t) {
    clearTimeout(t);
    turnTimers.delete(id);
  }
};

@WebSocketGateway({ namespace: '/connect-four', cors: buildWebSocketCorsOptions() })
export class ConnectFourGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(ConnectFourGateway.name);
  private usernameCache = new Map<string, string>();

  constructor(
    @InjectModel(ConnectFourGame.name) private readonly gameModel: Model<ConnectFourGameDocument>,
    @InjectModel('Room') private readonly roomModel: Model<any>,
    @InjectModel('User') private readonly userModel: Model<any>,
    private readonly config: ConfigService,
    private readonly roomsGateway: RoomsGateway,
    @Inject(REDIS_CLIENT) private readonly redis: any,
    private readonly i18n: I18nService,
    private readonly grace: GracePeriodService,
    private readonly turnDeadlines: TurnDeadlineService,
    @Optional() private readonly tournamentMatchService?: TournamentMatchService,
  ) {}

  onModuleInit() {
    this.grace.registerHandler('connect-four', (playerId, roomId) =>
      this.executeForfeit(roomId, playerId),
    );
    this.turnDeadlines.registerHandler('connect-four', (_playerId, roomId) =>
      this.executeConnectFourTurnTimeout(roomId),
    );
  }

  afterInit(server: Server) {
    applyWsAuth(server, this.config, this.redis);
    registerReliableDisconnectHandler((server as any).name, data => this.handleDisconnect({ id: data.id, data: data.data, handshake: { query: {} }, to: (room: string) => (server as any).to(room).except(`player:${data.data.player_id}`) } as unknown as Socket));
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

  private emit(client: Socket, success: boolean, data: Record<string, unknown>, messages: string[]) {
    durableEmit(client, EVENT, { success, data, messages });
  }

  private async buildPublicState(
    room: any,
    game: ConnectFourGameDocument | null,
    viewerPlayerNum: number | null,
    viewerIsSpectator: boolean,
  ): Promise<Record<string, unknown>> {
    const p1Id = room.players[0]?.playerId?.toString();
    const p2Id = room.players[1]?.playerId?.toString();
    const player1 = p1Id ? await this.getCachedUsername(p1Id) : 'Unknown';
    const player2 = p2Id ? await this.getCachedUsername(p2Id) : 'Unknown';
    const board = game?.board ? coerceConnectFourBoard(game.board) : createEmptyBoard();
    const currentPlayer = game?.current_player ?? 1;
    const currentTurnUserId =
      currentPlayer === 1 ? p1Id ?? null : p2Id ?? null;

    let winnerUserId: string | null = null;
    if (room.status === 'finished' && room.winner) {
      winnerUserId = room.winner.toString();
    }

    const totalTimer = room.game_id?.turn_timer_seconds ?? 30;
    let turnTimerSeconds = totalTimer;
    if (game?.turn_start_time && room.status === 'started') {
      const elapsed = (Date.now() - game.turn_start_time.getTime()) / 1000;
      turnTimerSeconds = Math.max(5, Math.ceil(totalTimer - elapsed));
    }

    const yourColor: ConnectFourColor | null =
      viewerPlayerNum === 1 ? 'R' : viewerPlayerNum === 2 ? 'Y' : null;

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
      yourTurn:
        !viewerIsSpectator &&
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

  private formatLastMoveFromGame(game: ConnectFourGameDocument | null): Record<string, unknown> | null {
    const lm = game?.last_move;
    if (!lm || (lm.color !== 'R' && lm.color !== 'Y')) return null;
    return {
      userId: String(lm.userId),
      row: Number(lm.row),
      col: Number(lm.col),
      color: lm.color,
      at: lm.at instanceof Date ? lm.at.toISOString() : String(lm.at ?? ''),
    };
  }

  handleConnection(client: Socket) {
    this.logger.log(`[ConnectFour] Connected: ${client.id}`);
  }

  @ReliableDisconnectAction()
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
      durableEmit(client.to(room_id), EVENT, {
        success: true,
        data: { spectatorsCount: updated?.spectators?.length || 0 },
        messages: [],
      });
      return;
    }

    if (room.status === 'waiting' || (room.status === 'started' && !room.game_ready_at)) {
      const updated = await this.roomModel.findOneAndUpdate(
        { _id: roomObjId, 'players.playerId': playerObjId },
        {
          $pull: { players: { playerId: playerObjId } },
          $set: { status: 'waiting', updated_at: new Date() },
          $unset: { started_at: 1, game_ready_at: 1, start_lock: 1, start_locked_at: 1 },
        },
        { returnDocument: 'after' },
      );
      if (!updated) return;
      const gameIdForLobby = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
      if (updated.players.length === 0) {
        await this.roomModel.findOneAndDelete({ _id: room_id, players: { $size: 0 } });
        this.server.serverSideEmit?.('roomDeleted', { id: room_id });
        if (gameIdForLobby) {
          this.roomsGateway.broadcastRoomUpdate(gameIdForLobby, 'roomDeleted', { id: room_id });
        }
      } else {
        const sLang = this.getLang(client);
        durableEmit(client.to(room_id), EVENT, {
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
        remainingTurnSecs = Math.ceil(
          (limit - (Date.now() - game.turn_start_time.getTime())) / 1000,
        );
      }
      const hasStartedPlay = room.players.some((player: any) => (player.moves?.length || 0) > 0);
      await this.grace.start('connect-four', player_id, room_id, hasStartedPlay ? 30 : 60);
    }
  }

  @ReliableInternalAction()
  async executeForfeit(room_id: string, player_id: string) {
    const room = await this.roomModel
      .findOne({ _id: new Types.ObjectId(room_id), status: 'started' })
      .populate('game_id', 'turn_timer_seconds');
    if (!room) return;

    const winner_id = room.players.find(
      (p: any) => p.playerId.toString() !== player_id,
    )?.playerId;
    if (!winner_id) return;

    room.status = 'finished';
    room.winner = winner_id;
    room.winner_reason = 'forfeit';
    room.finished_at = new Date();
    await room.save();

    const settlement = calculateWinnerSettlement(room.bet_amount, room.house_edge, room.players.length);
    await gameFinancialUpdate(this.userModel, 'findByIdAndUpdate', [winner_id, winnerBalanceUpdate(settlement)], room_id);

    const winnerUsername = await this.getCachedUsername(winner_id.toString());
    const game = await this.gameModel.findOne({ room_id: new Types.ObjectId(room_id) });
    const sockets = await this.server.in(room_id).fetchSockets();
    for (const s of sockets) {
      const sIsSpectator = (s as any).data.isSpectator || false;
      const sPNum = this.resolvePlayerNum(s, room);
      if (sPNum) (s as any).data.playerNum = sPNum;
      const sLang = this.getLang(s as unknown as Socket);
      const sState = await this.buildPublicState(
        room,
        game,
        sIsSpectator ? null : sPNum,
        sIsSpectator,
      );
      const isWinner = !sIsSpectator && sPNum > 0 && room.players[sPNum - 1]?.playerId?.toString() === winner_id.toString();
      durableEmit((s as unknown as Socket), EVENT, {
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

    const gameId = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
    if (gameId) this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
  }

  @SubscribeMessage('join')
  @ReliableReadAction()
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { room_id: string },
  ) {
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
      agentDebugLog('connect-four.gateway.ts:handleJoin', 'finished_resync', { room_id, player_id, reason: room.winner_reason }, 'H4');
      return this.emit(client, true, buildFinishedRoomSyncData(room, player_id), [
        this.i18n.translate('ws.games.playerDisconnected', lang),
      ]);
    }

    const isMember = room.players.some((p: any) => p.playerId.toString() === player_id);
    const isSpectator = room.spectators?.some((id: any) => id.toString() === player_id);
    if (!isMember && !isSpectator) {
      return this.emit(client, false, {}, [this.i18n.translate('ws.games.notInRoom', lang)]);
    }

    await client.join(room_id);
    client.data.room_id = room_id;
    client.data.isSpectator = !isMember;

    if (isMember && (room.status === 'waiting' || room.status === 'started')) {
      await this.roomModel.updateOne(
        { _id: room_id, status: { $in: ['waiting', 'started'] }, 'players.playerId': new Types.ObjectId(player_id) },
        { $set: { 'players.$.ready': true, 'players.$.ready_at': new Date(), 'players.$.game_socket_joined_at': new Date() } },
      );
    }

    this.logger.log(
      `event=connect_four_join room=${room_id} sid=${client.id} player=${player_id} status=${room.status}`,
    );

    const game = await this.gameModel.findOne({ room_id: new Types.ObjectId(room_id) });

    if (client.data.isSpectator) {
      if (room.status === 'started' && game) {
        const state = await this.buildPublicState(room, game, null, true);
        durableEmit(client.to(room_id), EVENT, {
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
      return this.emit(
        client,
        true,
        {
          ...lobbyState,
          waitingForOpponent: true,
          spectatorsCount: room.spectators?.length ?? 0,
        },
        [this.i18n.translate('ws.games.waitingOpponent', lang)],
      );
    }

    const playerIndex = room.players.findIndex((p: any) => p.playerId.toString() === player_id);
    const playerNum = playerIndex + 1;
    client.data.playerNum = playerNum;

    if (room.status === 'started' && game) {
      const state = await this.buildPublicState(room, game, playerNum, false);
      const isMyTurn = game.current_player === playerNum;
      if (isMyTurn) {
        this.startTimer(client, room_id, state.turnTimerSeconds as number);
      }
      return this.emit(client, true, {
        ...state,
        waitingForOpponent: false,
        gameStarted: true,
      }, []);
    }

    this.emit(
      client,
      true,
      {
        waitingForOpponent: true,
        isSpectator: false,
        playersJoined: room.players.length,
        maxPlayers: 2,
      },
      [this.i18n.translate('ws.games.waitingOpponent', lang)],
    );

    const socketsInRoom = await this.server.in(room_id).fetchSockets();
    agentDebugLog('connect-four.gateway.ts:handleJoin', 'waiting_join', {
      room_id,
      player_id,
      dbPlayers: room.players.length,
      socketCount: socketsInRoom.length,
    }, 'H1');

    await emitDbOpponentJoinedIfPresent({
      room,
      joiningPlayerId: player_id,
      getUsername: (id) => this.getCachedUsername(id),
      notifyJoiner: (opponentName) => {
        this.emit(client, true, { opponentJoined: true, opponentName }, [
          this.i18n.translate('ws.games.opponentJoined', lang, { username: opponentName }),
        ]);
      },
      notifyOthers: (joinerName) => {
        durableEmit(client.to(room_id), EVENT, {
          success: true,
          messages: [this.i18n.translate('ws.games.opponentJoined', lang, { username: joinerName })],
          data: { opponentJoined: true, opponentName: joinerName },
        });
      },
    });

    const maxPlayers = room.player_limit || room.game_id?.max_players || 2;
    if (
      room.players.length >= maxPlayers &&
      (room.status === 'waiting' || room.status === 'started') &&
      room.players[0]?.playerId &&
      room.players[1]?.playerId
    ) {
      await this.tryStartConnectFourGame(room_id, lang);
    }
    scheduleWaitingRoomReconcile(room_id, () => this.tryStartConnectFourGame(room_id, lang));
  }

  private resolvePlayerNum(socket: any, room: any): number {
    let pNum = Number(socket?.data?.playerNum) || 0;
    if (pNum === 1 || pNum === 2) return pNum;
    const pid = socket?.data?.player_id;
    if (!pid) return 0;
    const idx = room.players.findIndex((p: any) => p.playerId.toString() === pid);
    if (idx === 0) return 1;
    if (idx === 1) return 2;
    return 0;
  }

  private async countPlayerSockets(room_id: string): Promise<number> {
    const sockets = await this.server.in(room_id).fetchSockets();
    return sockets.filter((s) => !(s as any).data?.isSpectator).length;
  }

  /** Idempotent start when both player sockets are connected and the room is still waiting. */
  @ReliableInternalAction()
  private async tryStartConnectFourGame(room_id: string, lang: string): Promise<void> {
    const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds');
    if (!room || (room.status !== 'waiting' && room.status !== 'started')) return;
    if (room.players.length < 2 || !room.players[0]?.playerId || !room.players[1]?.playerId || !room.players.every((player: any) => player.ready)) {
      return;
    }

    agentDebugLog('connect-four.gateway.ts:tryStartConnectFourGame', 'start_attempt', {
      room_id,
      dbPlayers: room.players.length,
    }, 'H2');

    const lease = await acquireGameStartLease(this.roomModel, room_id);
    if (!lease) return;

    const [p1id, p2id] = [room.players[0].playerId, room.players[1].playerId];
    const paid: Types.ObjectId[] = [];
    let createdGameId: Types.ObjectId | null = null;

    const compensate = async (errKey: string, reason: string) => {
      this.logger.error(`event=connect_four_start_failed room=${room_id} reason=${reason}`);
      for (const pid of paid) {
        await gameFinancialUpdate(this.userModel, 'updateOne', [{ _id: pid }, { $inc: { balance: room.bet_amount } }], room_id)
          .catch((e) => this.logger.error(`[ConnectFour] Refund failed | player=${pid}`, e));
      }
      if (createdGameId) {
        await this.gameModel
          .deleteOne({ _id: createdGameId })
          .catch((e) => this.logger.error(`[ConnectFour] Game cleanup failed | room=${room_id}`, e));
      }
      await releaseGameStartLease(this.roomModel, room_id, lease.token)
        .catch((e) => this.logger.error(`[ConnectFour] Room status reset failed | room=${room_id}`, e));
      durableEmit(this.server.to(room_id), EVENT, {
        success: false,
        messages: [this.i18n.translate(errKey, lang)],
      });
    };

    const deduct1 = await gameFinancialUpdate(this.userModel, 'findOneAndUpdate', [{ _id: p1id, balance: { $gte: room.bet_amount } }, { $inc: { balance: -room.bet_amount } }, { returnDocument: 'after' }], room_id);
    if (!deduct1) {
      await compensate('ws.games.insufficientBalance', 'p1_insufficient');
      return;
    }
    paid.push(p1id);

    const deduct2 = await gameFinancialUpdate(this.userModel, 'findOneAndUpdate', [{ _id: p2id, balance: { $gte: room.bet_amount } }, { $inc: { balance: -room.bet_amount } }, { returnDocument: 'after' }], room_id);
    if (!deduct2) {
      await compensate('ws.games.insufficientBalance', 'p2_insufficient');
      return;
    }
    paid.push(p2id);

    const board = createEmptyBoard();
    try {
      const created = await this.gameModel.create({
        room_id: new Types.ObjectId(room_id),
        player1_id: p1id,
        player2_id: p2id,
        board,
        current_player: 1,
        winning_cells: [],
        turn_start_time: new Date(),
        move_revision: 0,
      });
      createdGameId = created._id;
    } catch (e) {
      this.logger.error(`[ConnectFour] Game create failed | room=${room_id}`, e);
      await compensate('ws.games.matchmakingError', 'game_create_failed');
      return;
    }

    const started = await publishGameStarted(this.roomModel, room_id, lease.token, { turn_start_time: new Date() });
    if (!started) {
      await compensate('ws.games.matchmakingError', 'start_lease_lost');
      return;
    }

    const timerSeconds = room.game_id?.turn_timer_seconds ?? 30;
    const freshGame = await this.gameModel.findOne({ room_id: new Types.ObjectId(room_id) });
    const populatedRoom = await this.roomModel.findById(room_id).populate('game_id');

    const freshPlayerSockets = (await this.server.in(room_id).fetchSockets()).filter(
      (s) => !(s as any).data?.isSpectator,
    );

    this.logger.log(
      `event=connect_four_start room=${room_id} sockets=${freshPlayerSockets.length}`,
    );

    for (const s of freshPlayerSockets) {
      try {
        const sPNum = this.resolvePlayerNum(s, room);
        if (sPNum) (s as any).data.playerNum = sPNum;
        const sIsSpectator = (s as any).data.isSpectator || false;
        const isFirst = sPNum === 1;
        const sLang = this.getLang(s as unknown as Socket);
        const sState = await this.buildPublicState(
          populatedRoom,
          freshGame,
          sIsSpectator ? null : sPNum,
          sIsSpectator,
        );
        durableEmit((s as unknown as Socket), EVENT, {
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
          this.startTimer(
            s as unknown as Socket,
            room_id,
            initialTurnDeadlineSeconds(timerSeconds),
          );
        }
      } catch (emitErr) {
        this.logger.error(
          `event=connect_four_start_emit_failed room=${room_id} sid=${s.id}`,
          emitErr,
        );
      }
    }

    const gId = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
    const populated = await this.roomModel
      .findById(room_id)
      .populate('game_id', '-created_at')
      .populate('players.playerId', 'username')
      .lean();
    if (gId) this.roomsGateway.broadcastRoomUpdate(gId, 'roomUpdated', populated);
  }

  @SubscribeMessage('get_state')
  @ReliableReadAction()
  async handleGetState(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { room_id: string },
  ) {
    const room_id = payload?.room_id || client.data.room_id;
    // `get_state` is also the recovery command for a full room stuck in WAITING.
    // Reuse join so it atomically marks this participant ready, reconciles durable
    // game creation, and sends the same private state as a fresh connection.
    return this.handleJoin(client, { room_id });
  }

  private async finalizeConnectFourMatch(
    room_id: string,
    game: ConnectFourGameDocument,
    outcome: { kind: 'draw' } | { kind: 'win'; winnerNum: 1 | 2 },
  ): Promise<any | null> {
    const winnerId =
      outcome.kind === 'win'
        ? outcome.winnerNum === 1
          ? game.player1_id
          : game.player2_id
        : null;

    const finishUpdate = {
      status: 'finished' as const,
      finished_at: new Date(),
      winner_reason: outcome.kind === 'draw' ? 'draw' : 'win',
      winner: winnerId ?? undefined,
    };

    let finishedRoom = await this.roomModel.findOneAndUpdate(
      { _id: room_id, status: 'started' },
      { $set: finishUpdate },
      { returnDocument: 'after' },
    );

    if (!finishedRoom) {
      const alreadyFinished = await this.roomModel.findOne({
        _id: room_id,
        status: 'finished',
      });
      if (alreadyFinished) return alreadyFinished;
    }

    if (!finishedRoom) return null;

    const isTournament = finishedRoom.source === 'tournament' && finishedRoom.tournament_match_id;

    if (isTournament && this.tournamentMatchService) {
      const loserId =
        outcome.kind === 'win' && winnerId
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
    } else if (outcome.kind === 'draw') {
      // Draw settlement (Halma-style): refund each player's stake. Bets were deducted at
      // match start; no house edge is applied on ties.
      await gameFinancialUpdate(this.userModel, 'updateOne', [{ _id: game.player1_id }, { $inc: { balance: finishedRoom.bet_amount } }], room_id);
      await gameFinancialUpdate(this.userModel, 'updateOne', [{ _id: game.player2_id }, { $inc: { balance: finishedRoom.bet_amount } }], room_id);
    } else if (!isTournament) {
      const settlement = calculateWinnerSettlement(
        finishedRoom.bet_amount,
        finishedRoom.house_edge,
        finishedRoom.players.length,
      );
      await gameFinancialUpdate(this.userModel, 'updateOne', [{ _id: winnerId }, winnerBalanceUpdate(settlement)], room_id);
    }

    const gameId =
      (finishedRoom.game_id as any)?._id?.toString() || finishedRoom.game_id?.toString();
    if (gameId) {
      this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
    }

    return finishedRoom;
  }

  @SubscribeMessage('drop_disc')
  @ReliableAction()
  async handleDropDisc(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { room_id?: string; col: number },
  ) {
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

    const playerNum = this.resolvePlayerNum(client, room) as 1 | 2;
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

    const isMember = room.players.some(
      (p: any) => p.playerId.toString() === client.data.player_id,
    );
    if (!isMember) {
      return this.emit(client, false, {}, [this.i18n.translate('ws.games.notInRoom', lang)]);
    }

    const game = await this.gameModel.findOne({ room_id: new Types.ObjectId(room_id) });
    if (!game) {
      return this.emit(client, false, {}, [this.i18n.translate('ws.games.gameNotFound', lang)]);
    }
    if (game.current_player !== playerNum) {
      return this.emit(client, false, {}, [this.i18n.translate('ws.games.notYourTurn', lang)]);
    }

    const color = colorForPlayerNum(playerNum);
    const board = coerceConnectFourBoard(game.board);
    const result = dropDisc(board, col, color);
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
    let winnerNum: 1 | 2 | null = null;
    let isDraw = false;

    if (result.win.won) {
      finished = true;
      winnerNum = playerNum;
      game.winning_cells = result.win.winningCells;
    } else if (result.isDraw) {
      finished = true;
      isDraw = true;
      game.winning_cells = [];
    } else {
      game.current_player = playerNum === 1 ? 2 : 1;
    }
    game.move_revision = (game.move_revision ?? 0) + 1;
    game.markModified('board');
    game.markModified('winning_cells');
    game.markModified('last_move');
    game.markModified('move_revision');

    try {
      await game.save();
      await recordGameAuditAction(this.roomModel, room_id, client.data.player_id, 'drop_disc', { col, row: result.row });
      this.logger.log(
        `[${new Date().toISOString()}] API game.save done room=${room_id} revision=${game.move_revision}`,
      );
    } catch (err) {
      this.logger.error(
        `event=connect_four_save_failed room=${room_id} finished=${finished}`,
        err,
      );
      return this.emit(client, false, { col }, [
        this.i18n.translate('ws.games.invalidMove', lang),
      ]);
    }

    this.logger.log(
      `[${new Date().toISOString()}] API handleDropDisc start room=${room_id} player=${client.data.player_id} col=${col}`,
    );

    const limit = room.game_id?.turn_timer_seconds || 30;
    const sockets = await this.server.in(room_id).fetchSockets();
    clearTimer(client.id);

    if (finished) {
      for (const s of sockets) {
        clearTimer(s.id);
      }
      // Mark room finished in memory so buildPublicState + clients see terminal state
      // before DB settlement (payout) completes — chess/domino emit before heavy I/O.
      room.status = 'finished';
      room.finished_at = new Date();
      room.winner_reason = isDraw ? 'draw' : 'win';
      room.winner = isDraw
        ? undefined
        : winnerNum === 1
          ? game.player1_id
          : game.player2_id;
      await room.save();
    } else {
      const opponent = sockets.find(
        (s) => this.resolvePlayerNum(s, room) === game.current_player,
      );
      if (opponent) {
        this.startTimer(opponent as unknown as Socket, room_id, limit);
      }
      room.turn_start_time = new Date();
      // Avoid persisting room state on every Connect Four move; keep the fast path aligned with Domino.
    }

    const displayPrize = winnerDisplayedPrize(
      room.bet_amount,
      room.house_edge,
      room.players.length,
    );
    const lastMove = {
      userId: client.data.player_id,
      row: result.row,
      col: result.col,
      color,
      at: new Date().toISOString(),
    };
    const stateVersion = await bumpGameStateVersion(this.redis, 'connect-four', room_id);
    const turnDeadlineAt = computeTurnDeadlineAt(game.turn_start_time, limit);

    this.logger.log(
      `[${new Date().toISOString()}] API emit connect-four room=${room_id} revision=${game.move_revision} stateVersion=${stateVersion} sockets=${sockets.length}`,
    );

    const socketInfos = sockets.map((s) => {
      const socket = s as unknown as Socket;
      const sLang = this.getLang(socket);
      const sIsSpectator = (s as any).data.isSpectator || false;
      const sPNum = this.resolvePlayerNum(socket, room);
      if (sPNum) (s as any).data.playerNum = sPNum;
      return { socket, sLang, sIsSpectator, sPNum };
    });

    const playerStateByNum = new Map<number, Record<string, unknown>>();
    for (const info of socketInfos) {
      if (!info.sIsSpectator && info.sPNum) {
        playerStateByNum.set(info.sPNum, await this.buildPublicState(room, game, info.sPNum, false));
      }
    }
    const spectatorState = socketInfos.some((info) => info.sIsSpectator)
      ? await this.buildPublicState(room, game, null, true)
      : null;

    for (const info of socketInfos) {
      try {
        const isWinner = finished && !isDraw && winnerNum === info.sPNum;
        const sState = info.sIsSpectator
          ? spectatorState ?? await this.buildPublicState(room, game, null, true)
          : playerStateByNum.get(info.sPNum ?? 1) ?? await this.buildPublicState(room, game, info.sPNum ?? 1, false);

        let msg = '';
        if (finished) {
          if (isDraw) {
            msg = this.i18n.translate('ws.games.drawGeneric', info.sLang);
          } else {
            msg = isWinner
              ? this.i18n.translate('ws.games.win', info.sLang)
              : this.i18n.translate('ws.games.lose', info.sLang);
          }
        } else if (info.socket.id === client.id) {
          msg = this.i18n.translate('ws.games.moveAccepted', info.sLang);
        } else {
          msg = this.i18n.translate('ws.games.opponentMoved', info.sLang);
        }

        durableEmit((info.socket as unknown as Socket), EVENT, {
          success: true,
          data: {
            ...sState,
            lastMove,
            gameEnded: finished,
            gameStarted: !finished,
            youWon: isWinner && !info.sIsSpectator,
            outcome: finished ? (isDraw ? 'draw' : isWinner ? 'win' : 'lose') : '',
            prize: isWinner ? displayPrize : 0,
            reason: finished ? (isDraw ? 'draw' : 'win') : undefined,
            isDraw: finished && isDraw,
            winnerUserId:
              finished && !isDraw && winnerNum
                ? winnerNum === 1
                  ? game.player1_id.toString()
                  : game.player2_id.toString()
                : null,
            stateVersion,
            ...(turnDeadlineAt ? { turnDeadlineAt } : {}),
          },
          messages: [msg],
        });
      } catch (emitErr) {
        this.logger.error(
          `event=connect_four_emit_failed room=${room_id} sid=${info.socket.id} finished=${finished}`,
          emitErr,
        );
      }
    }

    if (finished) {
      try {
        const settledRoom = await this.finalizeConnectFourMatch(
          room_id,
          game,
          isDraw ? { kind: 'draw' } : { kind: 'win', winnerNum: winnerNum! },
        );
        if (settledRoom) {
          room.status = settledRoom.status;
          room.winner = settledRoom.winner;
          room.winner_reason = settledRoom.winner_reason;
          room.finished_at = settledRoom.finished_at;
        } else {
          this.logger.error(
            `event=connect_four_finalize_failed room=${room_id} reason=room_not_started`,
          );
        }
      } catch (finalizeErr) {
        this.logger.error(
          `event=connect_four_finalize_error room=${room_id} finished=${finished}`,
          finalizeErr,
        );
      }
    }
  }

  @SubscribeMessage('forfeit')
  @ReliableAction()
  async handleForfeit(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { room_id?: string },
  ) {
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

  private startTimer(socket: Socket, room_id: string, seconds: number) {
    clearTimer(socket.id);
    const playerId = (socket.data?.player_id as string) || '';
    if (playerId) void this.turnDeadlines.schedule('connect-four', room_id, playerId, seconds);
    if (process.env.RELIABLE_COMMANDS_ENABLED === 'true') return;
    const t = setTimeout(() => void this.executeConnectFourTurnTimeout(room_id), seconds * 1000);
    turnTimers.set(socket.id, t);
  }

  @ReliableInternalAction()
  private async executeConnectFourTurnTimeout(room_id: string): Promise<void> {
    await this.turnDeadlines.cancel('connect-four', room_id);
    const game = await this.gameModel.findOne({ room_id: new Types.ObjectId(room_id) });
      if (!game) return;
      const winnerNum = game.current_player === 1 ? 2 : 1;
      const winnerId = winnerNum === 1 ? game.player1_id : game.player2_id;
      const room = await this.roomModel
        .findById(room_id)
        .populate('game_id', 'turn_timer_seconds');
      if (!room || room.status !== 'started') return;

      room.status = 'finished';
      room.winner = winnerId;
      room.winner_reason = 'timeout';
      room.finished_at = new Date();
      await room.save();

      const settlement = calculateWinnerSettlement(
        room.bet_amount,
        room.house_edge,
        room.players.length,
      );
      const displayPrize = settlement.netPrize;
      await gameFinancialUpdate(this.userModel, 'updateOne', [{ _id: winnerId }, winnerBalanceUpdate(settlement)], room_id);

      const sockets = await this.server.in(room_id).fetchSockets();
      const winnerUsername = await this.getCachedUsername(winnerId.toString());
      for (const s of sockets) {
        const sIsSpectator = (s as any).data.isSpectator || false;
        const sPNum = this.resolvePlayerNum(s, room);
        if (sPNum) (s as any).data.playerNum = sPNum;
        const isWinnerFound = sPNum === winnerNum;
        const sLang = this.getLang(s as unknown as Socket);
        const sState = await this.buildPublicState(
          room,
          game,
          sIsSpectator ? null : sPNum,
          sIsSpectator,
        );
        durableEmit((s as unknown as Socket), EVENT, {
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

      const gameId = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
      if (gameId) this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
  }
}
