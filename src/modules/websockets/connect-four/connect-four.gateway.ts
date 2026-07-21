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
  scheduleWaitingRoomReconcile,
} from '../../../common/ws/waiting-room-sync.util';
import { acquireGameStartLease, publishGameStarted, releaseGameStartLease } from '../../../common/ws/game-start-coordinator';

const EVENT = 'connect-four';
const EDGE_COMMAND_STREAM = 'p4c:rt:connect-four:commands';
const EDGE_EVENT_STREAM = 'p4c:rt:connect-four:events';
const EDGE_COMMAND_GROUP = 'p4c-api-connect-four';
const EDGE_STREAM_MAXLEN = '10000';

type EdgeCommandName = 'join' | 'get_state' | 'drop_disc' | 'forfeit' | 'disconnect';

interface EdgeCommand {
  id: string;
  commandId: string;
  event: EdgeCommandName;
  socketId: string;
  playerId: string;
  roomId: string;
  payload: Record<string, any>;
  lang: string;
}

interface EdgeEvent {
  target: 'socket' | 'room' | 'player' | 'spectators';
  event: string;
  payload: Record<string, unknown>;
  socketId?: string;
  roomId?: string;
  playerId?: string;
}

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
  private edgeBusRunning = false;
  private readonly edgeConsumerName = `api-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;

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
    // Direct /connect-four WebSocket proxy is preferred; disable Redis Streams consumer when unused.
  }

  afterInit(server: Server) {
    applyWsAuth(server, this.config, this.redis);
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
    client.emit(EVENT, { success, data, messages });
  }

  private async redisCommand(args: string[]): Promise<any> {
    if (typeof this.redis?.sendCommand === 'function') {
      return this.redis.sendCommand(args);
    }
    if (typeof this.redis?.send_command === 'function') {
      return this.redis.send_command(args);
    }
    throw new Error('Redis client does not support sendCommand');
  }

  private async ensureEdgeCommandGroup(): Promise<void> {
    try {
      await this.redisCommand([
        'XGROUP',
        'CREATE',
        EDGE_COMMAND_STREAM,
        EDGE_COMMAND_GROUP,
        '0',
        'MKSTREAM',
      ]);
    } catch (err) {
      const message = (err as Error).message || '';
      if (!message.includes('BUSYGROUP')) {
        throw err;
      }
    }
  }

  private parseStreamFields(fields: unknown): Record<string, string> {
    const items = Array.isArray(fields) ? fields : [];
    const out: Record<string, string> = {};
    for (let i = 0; i < items.length; i += 2) {
      out[String(items[i])] = String(items[i + 1] ?? '');
    }
    return out;
  }

  private parseEdgeCommand(streamId: string, fields: Record<string, string>): EdgeCommand | null {
    const event = fields.event as EdgeCommandName;
    if (!['join', 'get_state', 'drop_disc', 'forfeit', 'disconnect'].includes(event)) {
      return null;
    }
    let payload: Record<string, any> = {};
    try {
      payload = fields.payload ? JSON.parse(fields.payload) : {};
    } catch {
      payload = {};
    }
    return {
      id: streamId,
      commandId: fields.commandId || streamId,
      event,
      socketId: fields.socketId || '',
      playerId: fields.playerId || '',
      roomId: fields.roomId || payload.room_id || '',
      payload,
      lang: fields.lang || 'en',
    };
  }

  private async publishEdgeEvent(event: EdgeEvent): Promise<void> {
    await this.redisCommand([
      'XADD',
      EDGE_EVENT_STREAM,
      'MAXLEN',
      '~',
      EDGE_STREAM_MAXLEN,
      '*',
      'eventId',
      `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      'target',
      event.target,
      'event',
      event.event,
      'socketId',
      event.socketId ?? '',
      'roomId',
      event.roomId ?? '',
      'playerId',
      event.playerId ?? '',
      'payload',
      JSON.stringify(event.payload ?? {}),
      'issuedAt',
      new Date().toISOString(),
    ]);
  }

  private async publishEdgeEnvelope(
    target: Omit<EdgeEvent, 'event' | 'payload'>,
    success: boolean,
    data: Record<string, unknown>,
    messages: string[],
  ): Promise<void> {
    await this.publishEdgeEvent({
      ...target,
      event: EVENT,
      payload: { success, data, messages },
    });
  }

  private async startEdgeCommandConsumer(): Promise<void> {
    if (this.edgeBusRunning) return;
    this.edgeBusRunning = true;
    try {
      await this.ensureEdgeCommandGroup();
      this.logger.log('ConnectFour Redis Streams consumer listo');
    } catch (err) {
      this.logger.error('No se pudo inicializar el consumidor Redis Streams de ConnectFour', err);
      this.edgeBusRunning = false;
      return;
    }

    while (this.edgeBusRunning) {
      try {
        const response = await this.redisCommand([
          'XREADGROUP',
          'GROUP',
          EDGE_COMMAND_GROUP,
          this.edgeConsumerName,
          'COUNT',
          '10',
          'BLOCK',
          '5000',
          'STREAMS',
          EDGE_COMMAND_STREAM,
          '>',
        ]);
        await this.processEdgeReadResponse(response);
      } catch (err) {
        this.logger.warn(
          `ConnectFour Redis Streams consumer retry: ${(err as Error).message}`,
        );
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  private async processEdgeReadResponse(response: unknown): Promise<void> {
    if (!Array.isArray(response)) return;
    for (const stream of response) {
      const entries = Array.isArray(stream?.[1]) ? stream[1] : [];
      for (const entry of entries) {
        const streamId = String(entry?.[0] ?? '');
        const fields = this.parseStreamFields(entry?.[1]);
        const command = this.parseEdgeCommand(streamId, fields);
        if (!command) {
          await this.redisCommand(['XACK', EDGE_COMMAND_STREAM, EDGE_COMMAND_GROUP, streamId]);
          continue;
        }

        const processedKey = `p4c:rt:connect-four:processed:${command.commandId}`;
        const claimed = await this.redisCommand(['SET', processedKey, '1', 'EX', '300', 'NX']);
        if (claimed !== 'OK') {
          await this.redisCommand(['XACK', EDGE_COMMAND_STREAM, EDGE_COMMAND_GROUP, streamId]);
          continue;
        }

        try {
          await this.handleEdgeCommand(command);
        } catch (err) {
          this.logger.error(
            `event=connect_four_edge_command_failed command=${command.event} id=${command.commandId}`,
            err,
          );
          await this.publishEdgeEnvelope(
            { target: 'socket', socketId: command.socketId },
            false,
            {},
            [this.i18n.translate('ws.games.matchmakingError', command.lang)],
          );
        } finally {
          await this.redisCommand(['XACK', EDGE_COMMAND_STREAM, EDGE_COMMAND_GROUP, streamId]);
        }
      }
    }
  }

  private async handleEdgeCommand(command: EdgeCommand): Promise<void> {
    switch (command.event) {
      case 'join':
        return this.handleEdgeJoin(command);
      case 'get_state':
        return this.handleEdgeGetState(command);
      case 'drop_disc':
        return this.handleEdgeDropDisc(command);
      case 'forfeit':
        return this.handleEdgeForfeit(command);
      case 'disconnect':
        return this.handleEdgeDisconnect(command);
      default:
        return undefined;
    }
  }

  private resolvePlayerNumFromRoom(playerId: string, room: any): number {
    const idx = room.players.findIndex((p: any) => p.playerId.toString() === playerId);
    if (idx === 0) return 1;
    if (idx === 1) return 2;
    return 0;
  }

  private async handleEdgeJoin(command: EdgeCommand): Promise<void> {
    const player_id = command.playerId;
    const room_id = command.roomId || command.payload?.room_id;
    await this.grace.cancel('connect-four', player_id);

    if (!room_id) {
      return this.publishEdgeEnvelope(
        { target: 'socket', socketId: command.socketId },
        false,
        {},
        [this.i18n.translate('ws.invalidMessageFormat', command.lang)],
      );
    }

    const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds');
    if (!room) {
      return this.publishEdgeEnvelope(
        { target: 'socket', socketId: command.socketId },
        false,
        {},
        [this.i18n.translate('ws.games.gameNotFound', command.lang)],
      );
    }

    if (room.status === 'finished') {
      await this.publishEdgeEvent({
        target: 'socket',
        socketId: command.socketId,
        event: 'edge:join-room',
        payload: { roomId: room_id, isSpectator: false, playerNum: 0 },
      });
      return this.publishEdgeEnvelope(
        { target: 'socket', socketId: command.socketId },
        true,
        buildFinishedRoomSyncData(room, player_id),
        [this.i18n.translate('ws.games.playerDisconnected', command.lang)],
      );
    }

    const isMember = room.players.some((p: any) => p.playerId.toString() === player_id);
    const isSpectator = room.spectators?.some((id: any) => id.toString() === player_id);
    if (!isMember && !isSpectator) {
      return this.publishEdgeEnvelope(
        { target: 'socket', socketId: command.socketId },
        false,
        {},
        [this.i18n.translate('ws.games.notInRoom', command.lang)],
      );
    }

    const playerNum = isMember ? this.resolvePlayerNumFromRoom(player_id, room) : 0;
    if (isMember && room.status === 'waiting') {
      await this.roomModel.updateOne(
        { _id: room_id, status: 'waiting', 'players.playerId': new Types.ObjectId(player_id) },
        { $set: { 'players.$.ready': true } },
      );
    }
    await this.publishEdgeEvent({
      target: 'socket',
      socketId: command.socketId,
      event: 'edge:join-room',
      payload: { roomId: room_id, isSpectator: !isMember, playerNum },
    });

    const game = await this.gameModel.findOne({ room_id: new Types.ObjectId(room_id) });

    if (!isMember) {
      const state = await this.buildPublicState(room, game, null, true);
      return this.publishEdgeEnvelope(
        { target: 'socket', socketId: command.socketId },
        true,
        {
          ...state,
          waitingForOpponent: room.status !== 'started',
          gameStarted: room.status === 'started' || room.status === 'finished',
          spectatorsCount: room.spectators?.length ?? 0,
        },
        room.status === 'started'
          ? []
          : [this.i18n.translate('ws.games.waitingOpponent', command.lang)],
      );
    }

    if (room.status === 'started' && game) {
      const state = await this.buildPublicState(room, game, playerNum, false);
      return this.publishEdgeEnvelope(
        { target: 'socket', socketId: command.socketId },
        true,
        { ...state, waitingForOpponent: false, gameStarted: true },
        [],
      );
    }

    await this.publishEdgeEnvelope(
      { target: 'socket', socketId: command.socketId },
      true,
      {
        waitingForOpponent: true,
        isSpectator: false,
        playersJoined: room.players.length,
        maxPlayers: 2,
      },
      [this.i18n.translate('ws.games.waitingOpponent', command.lang)],
    );

    const maxPlayers = room.player_limit || room.game_id?.max_players || 2;
    if (room.players.length >= maxPlayers && room.status === 'waiting') {
      await this.tryStartConnectFourGameForEdge(room_id, command.lang);
    }
  }

  private async tryStartConnectFourGameForEdge(room_id: string, lang: string): Promise<void> {
    const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds');
    if (!room || room.status !== 'waiting') return;
    if (room.players.length < 2 || !room.players[0]?.playerId || !room.players[1]?.playerId || !room.players.every((player: any) => player.ready)) {
      return;
    }

    const lease = await acquireGameStartLease(this.roomModel, room_id);
    if (!lease) return;

    const [p1id, p2id] = [room.players[0].playerId, room.players[1].playerId];
    const paid: Types.ObjectId[] = [];
    const compensate = async (errKey: string, reason: string) => {
      this.logger.error(`event=connect_four_edge_start_failed room=${room_id} reason=${reason}`);
      for (const pid of paid) {
        await this.userModel
          .updateOne({ _id: pid }, { $inc: { balance: room.bet_amount } })
          .catch((e) => this.logger.error(`[ConnectFour] Edge refund failed | player=${pid}`, e));
      }
      await this.gameModel.deleteOne({ room_id: new Types.ObjectId(room_id) }).catch(() => null);
      await releaseGameStartLease(this.roomModel, room_id, lease.token).catch(() => null);
      for (const pid of [p1id, p2id]) {
        await this.publishEdgeEnvelope(
          { target: 'player', playerId: pid.toString() },
          false,
          {},
          [this.i18n.translate(errKey, lang)],
        );
      }
    };

    const deduct1 = await this.userModel.findOneAndUpdate(
      { _id: p1id, balance: { $gte: room.bet_amount } },
      { $inc: { balance: -room.bet_amount } },
      { returnDocument: 'after' },
    );
    if (!deduct1) return compensate('ws.games.insufficientBalance', 'p1_insufficient');
    paid.push(p1id);

    const deduct2 = await this.userModel.findOneAndUpdate(
      { _id: p2id, balance: { $gte: room.bet_amount } },
      { $inc: { balance: -room.bet_amount } },
      { returnDocument: 'after' },
    );
    if (!deduct2) return compensate('ws.games.insufficientBalance', 'p2_insufficient');
    paid.push(p2id);

    try {
      await this.gameModel.create({
        room_id: new Types.ObjectId(room_id),
        player1_id: p1id,
        player2_id: p2id,
        board: createEmptyBoard(),
        current_player: 1,
        winning_cells: [],
        turn_start_time: new Date(),
        move_revision: 0,
      });
    } catch (e) {
      this.logger.error(`[ConnectFour] Edge game create failed | room=${room_id}`, e);
      return compensate('ws.games.matchmakingError', 'game_create_failed');
    }

    const started = await publishGameStarted(this.roomModel, room_id, lease.token, { turn_start_time: new Date() });
    if (!started) return compensate('ws.games.matchmakingError', 'start_lease_lost');

    const timerSeconds = room.game_id?.turn_timer_seconds ?? 30;
    const freshGame = await this.gameModel.findOne({ room_id: new Types.ObjectId(room_id) });
    const populatedRoom = await this.roomModel.findById(room_id).populate('game_id');
    if (p1id) void this.turnDeadlines.schedule('connect-four', room_id, p1id.toString(), timerSeconds);

    for (const playerNum of [1, 2] as const) {
      const playerId = playerNum === 1 ? p1id.toString() : p2id.toString();
      const state = await this.buildPublicState(populatedRoom, freshGame, playerNum, false);
      await this.publishEdgeEnvelope(
        { target: 'player', playerId },
        true,
        { ...state, waitingForOpponent: false, gameStarted: true },
        [
          playerNum === 1
            ? this.i18n.translate('ws.games.yourTurn', lang)
            : this.i18n.translate('ws.games.waitingOpponent', lang),
        ],
      );
    }

    if ((populatedRoom?.spectators?.length ?? 0) > 0) {
      const spectatorState = await this.buildPublicState(populatedRoom, freshGame, null, true);
      await this.publishEdgeEnvelope(
        { target: 'spectators', roomId: room_id },
        true,
        { ...spectatorState, waitingForOpponent: false, gameStarted: true },
        [this.i18n.translate('ws.games.gameStarted', lang)],
      );
    }

    const gId = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
    const populated = await this.roomModel
      .findById(room_id)
      .populate('game_id', '-created_at')
      .populate('players.playerId', 'username')
      .lean();
    if (gId) this.roomsGateway.broadcastRoomUpdate(gId, 'roomUpdated', populated);
  }

  private async handleEdgeGetState(command: EdgeCommand): Promise<void> {
    const room_id = command.roomId || command.payload?.room_id;
    if (!room_id) {
      return this.publishEdgeEnvelope(
        { target: 'socket', socketId: command.socketId },
        false,
        {},
        [this.i18n.translate('ws.invalidMessageFormat', command.lang)],
      );
    }
    const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds');
    if (!room) {
      return this.publishEdgeEnvelope(
        { target: 'socket', socketId: command.socketId },
        false,
        {},
        [this.i18n.translate('ws.games.gameNotFound', command.lang)],
      );
    }
    const game = await this.gameModel.findOne({ room_id: new Types.ObjectId(room_id) });
    const isSpectator = room.spectators?.some((id: any) => id.toString() === command.playerId);
    const playerNum = isSpectator ? 0 : this.resolvePlayerNumFromRoom(command.playerId, room);
    const state = await this.buildPublicState(
      room,
      game,
      isSpectator ? null : playerNum,
      !!isSpectator,
    );
    await this.publishEdgeEnvelope(
      { target: 'socket', socketId: command.socketId },
      true,
      { gameState: state },
      [],
    );
  }

  private async handleEdgeDropDisc(command: EdgeCommand): Promise<void> {
    const room_id = command.roomId || command.payload?.room_id;
    const col = Number(command.payload?.col);
    if (!room_id || !Number.isInteger(col)) {
      return this.publishEdgeEnvelope(
        { target: 'socket', socketId: command.socketId },
        false,
        {},
        [this.i18n.translate('ws.games.invalidMove', command.lang)],
      );
    }

    const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds');
    if (!room) {
      return this.publishEdgeEnvelope(
        { target: 'socket', socketId: command.socketId },
        false,
        {},
        [this.i18n.translate('ws.games.gameNotFound', command.lang)],
      );
    }

    const playerNum = this.resolvePlayerNumFromRoom(command.playerId, room) as 1 | 2;
    if (playerNum !== 1 && playerNum !== 2) {
      return this.publishEdgeEnvelope(
        { target: 'socket', socketId: command.socketId },
        false,
        {},
        [this.i18n.translate('ws.games.notInRoom', command.lang)],
      );
    }
    if (room.status === 'finished') {
      return this.publishEdgeEnvelope(
        { target: 'socket', socketId: command.socketId },
        false,
        {},
        [this.i18n.translate('ws.games.roomInactive', command.lang)],
      );
    }
    if (room.status !== 'started') {
      return this.publishEdgeEnvelope(
        { target: 'socket', socketId: command.socketId },
        false,
        {},
        [this.i18n.translate('ws.games.gameNotFound', command.lang)],
      );
    }

    const game = await this.gameModel.findOne({ room_id: new Types.ObjectId(room_id) });
    if (!game) {
      return this.publishEdgeEnvelope(
        { target: 'socket', socketId: command.socketId },
        false,
        {},
        [this.i18n.translate('ws.games.gameNotFound', command.lang)],
      );
    }
    if (game.current_player !== playerNum) {
      return this.publishEdgeEnvelope(
        { target: 'socket', socketId: command.socketId },
        false,
        {},
        [this.i18n.translate('ws.games.notYourTurn', command.lang)],
      );
    }

    const expectedRevisionRaw = command.payload?.expectedRevision ?? command.payload?.moveRevision;
    if (expectedRevisionRaw !== undefined && expectedRevisionRaw !== null) {
      const expectedRevision = Number(expectedRevisionRaw);
      if (
        Number.isInteger(expectedRevision) &&
        expectedRevision !== Number(game.move_revision ?? 0)
      ) {
        const state = await this.buildPublicState(room, game, playerNum, false);
        return this.publishEdgeEnvelope(
          { target: 'socket', socketId: command.socketId },
          false,
          { gameState: state, expectedRevision, moveRevision: game.move_revision ?? 0 },
          [this.i18n.translate('ws.games.invalidMove', command.lang)],
        );
      }
    }

    const color = colorForPlayerNum(playerNum);
    const board = coerceConnectFourBoard(game.board);
    const result = dropDisc(board, col, color);
    if (!result.ok) {
      return this.publishEdgeEnvelope(
        { target: 'socket', socketId: command.socketId },
        false,
        { col },
        [this.i18n.translate('ws.games.invalidMove', command.lang)],
      );
    }

    game.board = result.board;
    game.turn_start_time = new Date();
    game.last_move = {
      userId: command.playerId,
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
    } catch (err) {
      this.logger.error(`event=connect_four_edge_save_failed room=${room_id}`, err);
      return this.publishEdgeEnvelope(
        { target: 'socket', socketId: command.socketId },
        false,
        { col },
        [this.i18n.translate('ws.games.invalidMove', command.lang)],
      );
    }

    const limit = room.game_id?.turn_timer_seconds || 30;
    await this.turnDeadlines.cancel('connect-four', room_id);
    if (finished) {
      room.status = 'finished';
      room.finished_at = new Date();
      room.winner_reason = isDraw ? 'draw' : 'win';
      room.winner = isDraw ? undefined : winnerNum === 1 ? game.player1_id : game.player2_id;
    } else {
      room.turn_start_time = new Date();
      await room.save();
      const nextPlayerId = game.current_player === 1 ? game.player1_id : game.player2_id;
      await this.turnDeadlines.schedule('connect-four', room_id, nextPlayerId.toString(), limit);
    }

    const displayPrize = winnerDisplayedPrize(room.bet_amount, room.house_edge, room.players.length);
    const lastMove = {
      userId: command.playerId,
      row: result.row,
      col: result.col,
      color,
      at: new Date().toISOString(),
    };
    const stateVersion = await bumpGameStateVersion(this.redis, 'connect-four', room_id);
    const turnDeadlineAt = computeTurnDeadlineAt(game.turn_start_time, limit);

    for (const sPNum of [1, 2] as const) {
      const playerId =
        sPNum === 1 ? game.player1_id.toString() : game.player2_id.toString();
      const isWinner = finished && !isDraw && winnerNum === sPNum;
      const state = await this.buildPublicState(room, game, sPNum, false);
      const message = finished
        ? isDraw
          ? this.i18n.translate('ws.games.drawGeneric', command.lang)
          : isWinner
            ? this.i18n.translate('ws.games.win', command.lang)
            : this.i18n.translate('ws.games.lose', command.lang)
        : sPNum === playerNum
          ? this.i18n.translate('ws.games.moveAccepted', command.lang)
          : this.i18n.translate('ws.games.opponentMoved', command.lang);

      await this.publishEdgeEnvelope(
        { target: 'player', playerId },
        true,
        {
          ...state,
          lastMove,
          gameEnded: finished,
          gameStarted: !finished,
          youWon: isWinner,
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
        [message],
      );
    }

    if ((room.spectators?.length ?? 0) > 0) {
      const spectatorState = await this.buildPublicState(room, game, null, true);
      await this.publishEdgeEnvelope(
        { target: 'spectators', roomId: room_id },
        true,
        {
          ...spectatorState,
          lastMove,
          gameEnded: finished,
          gameStarted: !finished,
          outcome: finished ? (isDraw ? 'draw' : 'win') : '',
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
        [this.i18n.translate(finished ? 'ws.games.gameOver' : 'ws.games.opponentMoved', command.lang)],
      );
    }

    if (finished) {
      await this.finalizeConnectFourMatch(
        room_id,
        game,
        isDraw ? { kind: 'draw' } : { kind: 'win', winnerNum: winnerNum! },
      );
    }
  }

  private async handleEdgeForfeit(command: EdgeCommand): Promise<void> {
    const room_id = command.roomId || command.payload?.room_id;
    if (!room_id || !command.playerId) {
      return this.publishEdgeEnvelope(
        { target: 'socket', socketId: command.socketId },
        false,
        {},
        [this.i18n.translate('ws.invalidMessageFormat', command.lang)],
      );
    }
    await this.grace.cancel('connect-four', command.playerId);
    await this.executeForfeit(room_id, command.playerId);
    await this.publishEdgeEnvelope(
      { target: 'socket', socketId: command.socketId },
      true,
      { gameEnded: true, outcome: 'forfeit' },
      [this.i18n.translate('ws.games.lose', command.lang)],
    );
  }

  private async handleEdgeDisconnect(command: EdgeCommand): Promise<void> {
    const room_id = command.roomId || command.payload?.room_id;
    const player_id = command.playerId;
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
      await this.publishEdgeEnvelope(
        { target: 'room', roomId: room_id },
        true,
        { spectatorsCount: updated?.spectators?.length || 0 },
        [],
      );
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
        await this.roomModel.findOneAndDelete({ _id: room_id, players: { $size: 0 } });
        if (gameIdForLobby) this.roomsGateway.broadcastRoomUpdate(gameIdForLobby, 'roomDeleted', { id: room_id });
      } else if (gameIdForLobby) {
        const populated = await this.roomModel
          .findById(roomObjId)
          .populate('game_id', '-created_at')
          .populate('players.playerId', 'username')
          .lean();
        this.roomsGateway.broadcastRoomUpdate(gameIdForLobby, 'roomUpdated', populated);
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
      const hasStartedPlay = room.players.some((player: any) => (player.moves?.length || 0) > 0);
      await this.grace.start('connect-four', player_id, room_id, hasStartedPlay ? 30 : 60);
    }
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
      client.to(room_id).emit(EVENT, {
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
        await this.roomModel.findOneAndDelete({ _id: room_id, players: { $size: 0 } });
        this.server.serverSideEmit?.('roomDeleted', { id: room_id });
        if (gameIdForLobby) {
          this.roomsGateway.broadcastRoomUpdate(gameIdForLobby, 'roomDeleted', { id: room_id });
        }
      } else {
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
        remainingTurnSecs = Math.ceil(
          (limit - (Date.now() - game.turn_start_time.getTime())) / 1000,
        );
      }
      const hasStartedPlay = room.players.some((player: any) => (player.moves?.length || 0) > 0);
      await this.grace.start('connect-four', player_id, room_id, hasStartedPlay ? 30 : 60);
    }
  }

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
    await this.userModel.findByIdAndUpdate(winner_id, winnerBalanceUpdate(settlement));

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
      (s as unknown as Socket).emit(EVENT, {
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

    for (const sPNum of [1, 2] as const) {
      const playerId = room.players[sPNum - 1]?.playerId?.toString();
      if (!playerId) continue;
      const state = await this.buildPublicState(room, game, sPNum, false);
      const isWinner = playerId === winner_id.toString();
      await this.publishEdgeEnvelope(
        { target: 'player', playerId },
        false,
        {
          ...state,
          outcome: 'opponent_disconnected',
          gameEnded: true,
          winner: winner_id.toString(),
          youWon: isWinner,
          isSpectator: false,
        },
        [this.i18n.translate(isWinner ? 'ws.games.win' : 'ws.games.playerDisconnected', 'en')],
      );
    }
    const gameId = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
    if (gameId) this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
  }

  @SubscribeMessage('join')
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

    if (isMember && room.status === 'waiting') {
      await this.roomModel.updateOne(
        { _id: room_id, status: 'waiting', 'players.playerId': new Types.ObjectId(player_id) },
        { $set: { 'players.$.ready': true } },
      );
    }

    this.logger.log(
      `event=connect_four_join room=${room_id} sid=${client.id} player=${player_id} status=${room.status}`,
    );

    const game = await this.gameModel.findOne({ room_id: new Types.ObjectId(room_id) });

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
        client.to(room_id).emit(EVENT, {
          success: true,
          messages: [this.i18n.translate('ws.games.opponentJoined', lang, { username: joinerName })],
          data: { opponentJoined: true, opponentName: joinerName },
        });
      },
    });

    const maxPlayers = room.player_limit || room.game_id?.max_players || 2;
    if (
      room.players.length >= maxPlayers &&
      room.status === 'waiting' &&
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
  private async tryStartConnectFourGame(room_id: string, lang: string): Promise<void> {
    const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds');
    if (!room || room.status !== 'waiting') return;
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

    const compensate = async (errKey: string, reason: string) => {
      this.logger.error(`event=connect_four_start_failed room=${room_id} reason=${reason}`);
      for (const pid of paid) {
        await this.userModel
          .updateOne({ _id: pid }, { $inc: { balance: room.bet_amount } })
          .catch((e) => this.logger.error(`[ConnectFour] Refund failed | player=${pid}`, e));
      }
      await this.gameModel
        .deleteOne({ room_id: new Types.ObjectId(room_id) })
        .catch((e) => this.logger.error(`[ConnectFour] Game cleanup failed | room=${room_id}`, e));
      await releaseGameStartLease(this.roomModel, room_id, lease.token)
        .catch((e) => this.logger.error(`[ConnectFour] Room status reset failed | room=${room_id}`, e));
      this.server.to(room_id).emit(EVENT, {
        success: false,
        messages: [this.i18n.translate(errKey, lang)],
      });
    };

    const deduct1 = await this.userModel.findOneAndUpdate(
      { _id: p1id, balance: { $gte: room.bet_amount } },
      { $inc: { balance: -room.bet_amount } },
      { returnDocument: 'after' },
    );
    if (!deduct1) {
      await compensate('ws.games.insufficientBalance', 'p1_insufficient');
      return;
    }
    paid.push(p1id);

    const deduct2 = await this.userModel.findOneAndUpdate(
      { _id: p2id, balance: { $gte: room.bet_amount } },
      { $inc: { balance: -room.bet_amount } },
      { returnDocument: 'after' },
    );
    if (!deduct2) {
      await compensate('ws.games.insufficientBalance', 'p2_insufficient');
      return;
    }
    paid.push(p2id);

    const board = createEmptyBoard();
    try {
      await this.gameModel.create({
        room_id: new Types.ObjectId(room_id),
        player1_id: p1id,
        player2_id: p2id,
        board,
        current_player: 1,
        winning_cells: [],
        turn_start_time: new Date(),
        move_revision: 0,
      });
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
        (s as unknown as Socket).emit(EVENT, {
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
          this.startTimer(s as unknown as Socket, room_id, timerSeconds);
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
  async handleGetState(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { room_id: string },
  ) {
    const lang = this.getLang(client);
    const player_id = client.data.player_id;
    const room_id = payload?.room_id || client.data.room_id;
    if (!room_id) {
      return this.emit(client, false, {}, [this.i18n.translate('ws.invalidMessageFormat', lang)]);
    }

    const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds');
    if (!room) {
      return this.emit(client, false, {}, [this.i18n.translate('ws.games.gameNotFound', lang)]);
    }
    if (room.status === 'finished') {
      return this.emit(client, true, buildFinishedRoomSyncData(room, player_id), []);
    }

    const isMember = room.players.some((p: any) => p.playerId.toString() === player_id);
    const isSpectator = room.spectators?.some((id: any) => id.toString() === player_id);
    if (!isMember && !isSpectator) {
      return this.emit(client, false, {}, [this.i18n.translate('ws.games.notInRoom', lang)]);
    }

    const game = await this.gameModel.findOne({ room_id: new Types.ObjectId(room_id) });
    const playerNum = this.resolvePlayerNum(client, room) || client.data.playerNum || 0;
    if (playerNum) client.data.playerNum = playerNum;
    const state = await this.buildPublicState(
      room,
      game,
      isSpectator ? null : playerNum,
      !!isSpectator,
    );
    client.data.room_id = room_id;
    client.data.isSpectator = !isMember;
    this.emit(client, true, {
      ...state,
      waitingForOpponent: room.status !== 'started',
      gameStarted: room.status === 'started',
    }, []);
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
      await this.userModel.updateOne(
        { _id: game.player1_id },
        { $inc: { balance: finishedRoom.bet_amount } },
      );
      await this.userModel.updateOne(
        { _id: game.player2_id },
        { $inc: { balance: finishedRoom.bet_amount } },
      );
    } else if (!isTournament) {
      const settlement = calculateWinnerSettlement(
        finishedRoom.bet_amount,
        finishedRoom.house_edge,
        finishedRoom.players.length,
      );
      await this.userModel.updateOne({ _id: winnerId }, winnerBalanceUpdate(settlement));
    }

    const gameId =
      (finishedRoom.game_id as any)?._id?.toString() || finishedRoom.game_id?.toString();
    if (gameId) {
      this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
    }

    return finishedRoom;
  }

  @SubscribeMessage('drop_disc')
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

        (info.socket as unknown as Socket).emit(EVENT, {
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
    const t = setTimeout(() => void this.executeConnectFourTurnTimeout(room_id), seconds * 1000);
    turnTimers.set(socket.id, t);
  }

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
      const displayPrize = settlement.netWinnings;
      await this.userModel.updateOne({ _id: winnerId }, winnerBalanceUpdate(settlement));

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
        (s as unknown as Socket).emit(EVENT, {
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

      for (const sPNum of [1, 2] as const) {
        const playerId =
          sPNum === 1 ? game.player1_id.toString() : game.player2_id.toString();
        const isWinnerFound = sPNum === winnerNum;
        const state = await this.buildPublicState(room, game, sPNum, false);
        await this.publishEdgeEnvelope(
          { target: 'player', playerId },
          true,
          {
            ...state,
            gameEnded: true,
            outcome: isWinnerFound ? 'win' : 'timeout_loss',
            youWon: isWinnerFound,
            winner: winnerId.toString(),
            winnerUserId: winnerId.toString(),
            reason: 'timeout',
            prize: isWinnerFound ? displayPrize : 0,
            isSpectator: false,
          },
          [
            this.i18n.translate(
              isWinnerFound ? 'ws.games.timeoutWin' : 'ws.games.timeoutLoss',
              'en',
            ),
          ],
        );
      }

      const gameId = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
      if (gameId) this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
  }
}
