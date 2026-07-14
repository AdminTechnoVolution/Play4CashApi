import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  MessageBody, ConnectedSocket, OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit,
} from '@nestjs/websockets';
import { Inject, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { GracePeriodService } from '../../../common/grace-period/grace-period.service';
import { TurnDeadlineService } from '../../../common/turn-deadline/turn-deadline.service';
import { enrichGamePayload } from '../../../common/utils/game-state-version.util';
import { WebPushService } from '../../../common/web-push/web-push.service';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { Model, Types } from 'mongoose';
import { buildWebSocketCorsOptions } from '../../../common/cors/origin-policy';
import { applyWsAuth } from '../../../common/guards/ws-auth.middleware';
import { REDIS_CLIENT } from '../../../common/redis/redis.module';
import { RoomsGateway } from '../rooms/rooms.gateway';
import { ChessGame, ChessGameDocument } from './schemas/chess-game.schema';
import { I18nService } from '../../../common/i18n/i18n.service';
import { winnerGrossPayout, winnerDisplayedPrize, winnerBalanceUpdate } from '../../../common/utils/game-prize.util';
import { TournamentMatchService } from '../../tournament/services/tournament-match.service';
import {
  createInitialBoard,
  getLegalMoves,
  applyMove,
  getGameResult,
  isCheck,
  isCastlingLegal,
  COLORS,
  Board,
  GameState,
} from './chess-game.logic';
import {
  agentDebugLog,
  buildFinishedRoomSyncData,
  emitDbOpponentJoinedIfPresent,
  scheduleWaitingRoomReconcile,
} from '../../../common/ws/waiting-room-sync.util';

// Timer map stored in-memory per pod (acceptable for single-instance deployments)
const turnTimers = new Map<string, ReturnType<typeof setTimeout>>();

function clearTimer(socketId: string) {
  const t = turnTimers.get(socketId);
  if (t) { clearTimeout(t); turnTimers.delete(socketId); }
}

@WebSocketGateway({ namespace: '/chess', cors: buildWebSocketCorsOptions() })
export class ChessGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(ChessGateway.name);
  private usernameCache = new Map<string, string>();

  private async getCachedUsername(userId: string): Promise<string> {
    if (this.usernameCache.has(userId)) return this.usernameCache.get(userId)!;
    const user = await this.userModel.findById(userId).select('username').lean();
    const username = user?.username || 'Unknown';
    if (user) this.usernameCache.set(userId, username);
    return username;
  }

  private getLang(client: Socket): string {
    return (client.handshake?.query?.lang as string) || (client.data?.lang as string) || 'en';
  }

  constructor(
    @InjectModel(ChessGame.name) private readonly chessGameModel: Model<ChessGameDocument>,
    @InjectModel('Room') private readonly roomModel: Model<any>,
    @InjectModel('User') private readonly userModel: Model<any>,
    private readonly config: ConfigService,
    private readonly roomsGateway: RoomsGateway,
    @Inject(REDIS_CLIENT) private readonly redis: any,
    private readonly i18n: I18nService,
    private readonly grace: GracePeriodService,
    private readonly turnDeadlines: TurnDeadlineService,
    private readonly webPush: WebPushService,
    @Optional() private readonly tournamentMatchService?: TournamentMatchService,
  ) {}

  /** Phase B: register the forfeit handler with the distributed grace sweeper. */
  onModuleInit() {
    this.grace.registerHandler('chess', (playerId, roomId) => this.executeForfeit(roomId, playerId));
    this.turnDeadlines.registerHandler('chess', (_playerId, roomId) =>
      this.executeTurnTimeout(roomId),
    );
  }

  afterInit(server: Server) { applyWsAuth(server, this.config, this.redis); }

  /** Compute castling availability for a given player */
  private getCastlingAvailable(board: Board, state: GameState, playerNum: 1 | 2) {
    const playerState: GameState = { ...state, current_player: playerNum };
    return {
      kingSide: isCastlingLegal(board, playerState, 'K').legal,
      queenSide: isCastlingLegal(board, playerState, 'Q').legal,
    };
  }

  handleConnection(client: Socket) { this.logger.log(`[Chess] Connected: ${client.id}`); }

  async handleDisconnect(client: Socket) {
    clearTimer(client.id);
    const { room_id, player_id } = client.data;
    if (!room_id || !player_id) return;

    const roomObjId = new Types.ObjectId(room_id);
    const playerObjId = new Types.ObjectId(player_id);

    const room = await this.roomModel.findOne({ _id: roomObjId, $or: [{ 'players.playerId': playerObjId }, { spectators: playerObjId }] });
    if (!room || room.status === 'finished') return;

    const isSpectator = room.spectators?.some((id: any) => id.toString() === player_id);
    if (isSpectator) {
      const updated = await this.roomModel.findOneAndUpdate({ _id: room_id }, { $pull: { spectators: playerObjId } }, { returnDocument: 'after' });
      client.to(room_id).emit('chess', { success: true, data: { spectatorsCount: updated?.spectators?.length || 0 }, messages: [] });
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
        // Phase D: broadcast to lobby subscribers (rooms namespace) as well, not
        // just to chess-namespace peers.
        if (gameIdForLobby) this.roomsGateway.broadcastRoomUpdate(gameIdForLobby, 'roomDeleted', { id: room_id });
      } else {
        const sLang = this.getLang(client);
        client.to(room_id).emit('chess', { success: true, messages: [this.i18n.translate('ws.games.opponentLeft', sLang)], data: { opponentLeft: true, waitingForOpponent: true } });
        // Phase D: refresh lobby player count.
        if (gameIdForLobby) {
          const populated = await this.roomModel
            .findById(roomObjId)
            .populate('game_id', '-created_at')
            .populate('players.playerId', 'username')
            .lean();
          if (populated) this.roomsGateway.broadcastRoomUpdate(gameIdForLobby, 'roomUpdated', populated);
        }
      }
      return;
    }

    if (room.status === 'started') {
      // Phase B: distributed grace via Mongo + sweep cron. The service clamps to
      // `MIN_GRACE_SECS` (30 s) so a disconnect at the tail end of a turn still gives
      // the mobile user the product-minimum window to reconnect.
      const game = await this.chessGameModel.findOne({ room_id: roomObjId });
      let remainingTurnSecs = 0;
      if (game) {
        const turnStart = game.turn_start_time?.getTime();
        const limit = (room.game_id?.turn_timer_seconds || 30) * 1000;
        if (turnStart) remainingTurnSecs = Math.ceil((limit - (Date.now() - turnStart)) / 1000);
      }
      const hasStartedPlay = room.players.some((player: any) => (player.moves?.length || 0) > 0);
      await this.grace.start('chess', player_id, room_id, hasStartedPlay ? 30 : 60);
    }
  }

  private async executeForfeit(room_id: string, player_id: string) {
    const room = await this.roomModel.findOne({ _id: new Types.ObjectId(room_id), status: 'started' });
    if (!room) return;

    const winner_id = room.players.find((p: any) => p.playerId.toString() !== player_id.toString())?.playerId;
    if (!winner_id) return;

    room.status = 'finished' as any;
    room.winner = winner_id;
    room.winner_reason = 'forfeit';
    room.finished_at = new Date();
    await room.save();

    await this.tournamentMatchService?.tryCompleteFromFinishedRoom(
      room,
      winner_id.toString(),
      'forfeit',
    );

    const grossPayout = winnerGrossPayout(room.bet_amount, room.house_edge, room.players.length);
    await this.userModel.findByIdAndUpdate(winner_id, winnerBalanceUpdate(grossPayout));

    const winnerUsername = await this.getCachedUsername(winner_id.toString());
    const sockets = await this.server.in(room_id).fetchSockets();
    for (const s of sockets) {
      const sIsSpectator = (s as any).data.isSpectator || false;
      const sLang = this.getLang(s as unknown as Socket);
      (s as unknown as Socket).emit('chess', {
        success: false,
        messages: sIsSpectator ? [this.i18n.translate('ws.games.winsForfeit', sLang, { username: winnerUsername })] : [this.i18n.translate('ws.games.playerDisconnected', sLang)],
        data: { outcome: 'opponent_disconnected', gameEnded: true, winner: sIsSpectator ? winnerUsername : winner_id, isSpectator: sIsSpectator }
      });
    }
    const gameId = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
    if (gameId) this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
  }

  @SubscribeMessage('join')
  async handleJoin(@ConnectedSocket() client: Socket, @MessageBody() payload: { room_id: string }) {
    const lang = this.getLang(client);
    const player_id = client.data.player_id;

    const room_id = payload?.room_id;
    // Phase B: cancel any open disconnect grace via the distributed service.
    await this.grace.cancel('chess', player_id);

    if (!room_id) return client.emit('chess', { success: false, messages: [this.i18n.translate('ws.invalidMessageFormat', lang)] });
    
    const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds');
    if (!room) return client.emit('chess', { success: false, messages: [this.i18n.translate('ws.games.gameNotFound', lang)] });
    if (room.status === 'finished') {
      agentDebugLog('chess.gateway.ts:handleJoin', 'finished_resync', { room_id, player_id, reason: room.winner_reason }, 'H4');
      return client.emit('chess', {
        success: true,
        messages: [this.i18n.translate('ws.games.playerDisconnected', lang)],
        data: buildFinishedRoomSyncData(room, player_id),
      });
    }

    const isMember = room.players.some((p: any) => p.playerId.toString() === player_id);
    const isSpectator = room.spectators?.some((id: any) => id.toString() === player_id);
    if (!isMember && !isSpectator) return client.emit('chess', { success: false, messages: [this.i18n.translate('ws.games.notInRoom', lang)] });

    await client.join(room_id);
    client.data.room_id = room_id;
    client.data.isSpectator = !isMember;

    if (client.data.isSpectator) {
      this.logger.log(`[Chess] 👀 Spectator joined | room=${room_id} | player=${player_id}`);
      const game = await this.chessGameModel.findOne({ room_id });
      if (game) {
        const p1Id = room.players[0]?.playerId?.toString();
        const p2Id = room.players[1]?.playerId?.toString();
        const player1 = p1Id ? await this.getCachedUsername(p1Id) : 'Unknown';
        const player2 = p2Id ? await this.getCachedUsername(p2Id) : 'Unknown';

        const shotFrom = game.current_player === 1 ? player1 : player2;

        client.emit('chess', { success: true, messages: [], data: {
          board: game.board,
          yourTurn: false, turnTimerSeconds: 30,
          waitingForOpponent: false, 
          isPlayerOne: false, playingWhite: false, 
          gameStarted: true, youWon: false,
          isSpectator: true,
          spectatorsCount: room.spectators.length,
          castlingAvailable: { kingSide: false, queenSide: false },
          player1, player2, shotFrom, turnOf: shotFrom,
          history: (game.history || []).map((m: any) => ({
            ...m,
            player: m.player === 1 ? player1 : (m.player === 2 ? player2 : m.player)
          }))
        }});
        client.to(room_id).emit('chess', { success: true, data: { spectatorsCount: room.spectators.length }, messages: [] });
        return;
      } else {
        return client.emit('chess', { success: false, messages: [this.i18n.translate('ws.games.gameNotFound', lang)] });
      }
    }

    const playerIndex = room.players.findIndex((p: any) => p.playerId.toString() === player_id);
    const playerNum = playerIndex === 0 ? 1 : 2;
    client.data.playerNum = playerNum;

    if (room.status === 'started') {
      const game = await this.chessGameModel.findOne({ room_id });
      if (game) {
        const totalTimerSeconds = room.game_id?.turn_timer_seconds || 30;
        let timerSeconds = totalTimerSeconds;
        if (room.turn_start_time) {
          const elapsed = (Date.now() - new Date(room.turn_start_time).getTime()) / 1000;
          timerSeconds = Math.max(5, Math.ceil(totalTimerSeconds - elapsed));
        }

        const isMyTurn = game.current_player === playerNum;
        const currentBoard = game.board;
        const currentState = game.toObject() as any;

        if (isMyTurn) {
          this.startTimer(client, room_id, timerSeconds);
        }

        return client.emit('chess', { success: true, messages: [], data: {
          board: currentBoard,
          yourTurn: isMyTurn, turnTimerSeconds: timerSeconds,
          waitingForOpponent: false, isPlayerOne: playerNum === 1, playingWhite: playerNum === 1, gameStarted: true, youWon: false, isSpectator: false,
          castlingAvailable: this.getCastlingAvailable(currentBoard, currentState, playerNum as 1 | 2),
        }});
      }
    }

    client.emit('chess', { success: true, messages: [this.i18n.translate('ws.games.waitingOpponent', lang)], data: { room_id, waitingForOpponent: true, isPlayerOne: playerNum === 1, isSpectator: false, playersJoined: room.players.length, maxPlayers: 2 } });

    const socketsInRoom = await this.server.in(room_id).fetchSockets();
    agentDebugLog('chess.gateway.ts:handleJoin', 'waiting_join', {
      room_id,
      player_id,
      dbPlayers: room.players.length,
      socketCount: socketsInRoom.length,
      roomStatus: room.status,
    }, 'H1');

    await emitDbOpponentJoinedIfPresent({
      room,
      joiningPlayerId: player_id,
      getUsername: (id) => this.getCachedUsername(id),
      notifyJoiner: (opponentName) => {
        client.emit('chess', {
          success: true,
          messages: [this.i18n.translate('ws.games.opponentJoined', lang, { username: opponentName })],
          data: { opponentJoined: true, opponentName },
        });
      },
      notifyOthers: (joinerName) => {
        client.to(room_id).emit('chess', {
          success: true,
          messages: [this.i18n.translate('ws.games.opponentJoined', lang, { username: joinerName })],
          data: { opponentJoined: true, opponentName: joinerName },
        });
      },
    });

    if (room.players.length >= 2 && room.players.every((player: any) => player.ready) && room.status === 'waiting') {
      await this.tryStartChessGame(room_id, lang);
    }
    scheduleWaitingRoomReconcile(room_id, () => this.tryStartChessGame(room_id, lang));
  }

  @SubscribeMessage('get_state')
  async handleGetState(@ConnectedSocket() client: Socket, @MessageBody() payload: { room_id: string }) {
    return this.handleJoin(client, payload);
  }

  /** Idempotent start when DB has two players; socket count must not gate start. */
  private async tryStartChessGame(room_id: string, lang: string): Promise<void> {
    const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds');
    if (!room || room.status !== 'waiting') return;
    if (room.players.length < 2 || !room.players[0]?.playerId || !room.players[1]?.playerId || !room.players.every((player: any) => player.ready)) {
      return;
    }

    const socketsInRoom = await this.server.in(room_id).fetchSockets();
    agentDebugLog('chess.gateway.ts:tryStartChessGame', 'start_attempt', {
      room_id,
      dbPlayers: room.players.length,
      socketCount: socketsInRoom.length,
    }, 'H2');

    const started = await this.roomModel.findOneAndUpdate({ _id: room_id, status: 'waiting' }, { $set: { status: 'started' } }, { returnDocument: 'after' });
    if (!started) return;

    const [p1id, p2id] = [room.players[0].playerId, room.players[1].playerId];
    const paid: any[] = [];

    const compensate = async (errKey: string, reason: string) => {
      this.logger.error(`event=chess_start_failed room=${room_id} reason=${reason}`);
      for (const pid of paid) {
        await this.userModel
          .updateOne({ _id: pid }, { $inc: { balance: room.bet_amount } })
          .catch((e) => this.logger.error(`[Chess] Refund failed | player=${pid}`, e));
      }
      await this.chessGameModel
        .deleteOne({ room_id: new Types.ObjectId(room_id) })
        .catch((e) => this.logger.error(`[Chess] Game cleanup failed | room=${room_id}`, e));
      await this.roomModel
        .findByIdAndUpdate(room_id, { $set: { status: 'waiting' } })
        .catch((e) => this.logger.error(`[Chess] Room status reset failed | room=${room_id}`, e));
      this.server
        .to(room_id)
        .emit('chess', { success: false, messages: [this.i18n.translate(errKey, lang)] });
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

    const board = createInitialBoard();
    try {
      await this.chessGameModel.create({
        room_id,
        player1_id: p1id,
        player2_id: p2id,
        board,
        current_player: 1,
        castling_rights: { wK: true, wQ: true, bK: true, bQ: true },
        en_passant_target: null,
        turn_start_time: new Date(),
      });
    } catch (e) {
      this.logger.error(`[Chess] Game create failed | room=${room_id}`, e);
      await compensate('ws.games.matchmakingError', 'game_create_failed');
      return;
    }
    const timerSeconds = room.game_id?.turn_timer_seconds ?? 30;

    const initialState: GameState = { current_player: 1, castling_rights: { wK:true,wQ:true,bK:true,bQ:true }, en_passant_target: null };
    const freshSockets = await this.server.in(room_id).fetchSockets();
    agentDebugLog('chess.gateway.ts:tryStartChessGame', 'game_started', {
      room_id,
      emitSocketCount: freshSockets.length,
    }, 'H2');

    for (const s of freshSockets) {
      const sPNum = (s as any).data.playerNum;
      const sIsSpectator = (s as any).data.isSpectator || false;
      const isFirst = sPNum === 1;
      const sLang = this.getLang(s as unknown as Socket);
      (s as unknown as Socket).emit('chess', { success: true, data: { board, yourTurn: isFirst && !sIsSpectator, turnTimerSeconds: timerSeconds, waitingForOpponent: false, isPlayerOne: isFirst, playingWhite: isFirst, gameStarted: true, youWon: false, isSpectator: sIsSpectator,
        castlingAvailable: this.getCastlingAvailable(board, initialState, sPNum as 1 | 2) },
        messages: sIsSpectator ? [this.i18n.translate('ws.games.gameStarted', sLang)] : [isFirst ? this.i18n.translate('ws.games.yourTurn', sLang) : this.i18n.translate('ws.games.waitingOpponent', sLang)] });
      if (isFirst) this.startTimer(s as unknown as Socket, room_id, timerSeconds);
    }
    const gId = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
    const populated = await this.roomModel.findById(room_id).populate('game_id', '-created_at').populate('players.playerId', 'username').lean();
    if (gId) this.roomsGateway.broadcastRoomUpdate(gId, 'roomUpdated', populated);
  }


  @SubscribeMessage('move')
  async handleMove(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
    const lang = this.getLang(client);
    if (client.data.isSpectator) return client.emit('chess', { success: false, messages: [this.i18n.translate('ws.games.spectatorActionDenied', lang)] });
    const room_id = payload.room_id || client.data.room_id;
    this.logger.log(`[Chess] ♟ Move received | room=${room_id} | player=${client.data.player_id} | payload=${JSON.stringify(payload)}`);
    const { promotion } = payload;
    let { from, to } = payload;

    if (!from && payload.from_row !== undefined && payload.from_col !== undefined) {
      from = { row: Number(payload.from_row), col: Number(payload.from_col) };
    }
    if (!to && payload.to_row !== undefined && payload.to_col !== undefined) {
      to = { row: Number(payload.to_row), col: Number(payload.to_col) };
    }

    const playerNum = client.data.playerNum || 1;
    if (!room_id || !from || !to) {
      this.logger.warn(`[Chess] ❌ Invalid move payload (missing fields) | player=${client.data.player_id} | room_id=${room_id} | payload=${JSON.stringify(payload)} | socketRoom=${client.data.room_id}`);
      return client.emit('chess', { success: false, messages: [this.i18n.translate('ws.games.invalidMove', lang)] });
    }

    const game = await this.chessGameModel.findOne({ room_id: new Types.ObjectId(room_id) });
    if (!game) return client.emit('chess', { success: false, messages: [this.i18n.translate('ws.games.gameNotFound', lang)] });
    if (game.current_player !== playerNum) return client.emit('chess', { success: false, messages: [this.i18n.translate('ws.games.notYourTurn', lang)] });

    const playerColor = playerNum === 1 ? COLORS.WHITE : COLORS.BLACK;
    const legalMoves = getLegalMoves(from.row, from.col, game.board, game.toObject() as any);
    const move = legalMoves.find((m: any) => m.to.row === to.row && m.to.col === to.col);
    if (!move) {
      const inCheck = isCheck(playerColor, game.board, game.toObject() as any);
      this.logger.warn(`[Chess] ❌ Illegal move | player=${client.data.player_id} | from=[${from.row},${from.col}] | to=[${to.row},${to.col}] | inCheck=${inCheck}`);
      return client.emit('chess', {
        success: false,
        messages: [this.i18n.translate(inCheck ? 'ws.chess.illegalMoveInCheck' : 'ws.chess.illegalMove', lang)],
        data: { board: game.board, yourTurn: true, inCheck },
      });
    }
    if (promotion) move.promotion = promotion;

    const { nextBoard, nextState } = applyMove(move, game.board, game.toObject() as any);
    const result = getGameResult(nextBoard, nextState);

    game.board = nextBoard;
    game.current_player = nextState.current_player;
    game.castling_rights = nextState.castling_rights;
    game.en_passant_target = nextState.en_passant_target;
    const movingPlayerUsername = await this.getCachedUsername(client.data.player_id);
    game.history.push({ player: movingPlayerUsername, from, to, moveType: move.castle ? 'castle' : move.enPassant ? 'enPassant' : 'normal' });
    game.turn_start_time = new Date();
    game.markModified('board');
    await game.save();

    const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds');
    if (!room) return client.emit('chess', { success: false, messages: [this.i18n.translate('ws.games.gameNotFound', lang)] });
    
    const limit = room.game_id?.turn_timer_seconds || 30;
    const sockets = await this.server.in(room_id).fetchSockets();
    const opponent = sockets.find(s => (s as any).data.playerNum === game.current_player);
    clearTimer(client.id);
    if (opponent) {
      this.startTimer(opponent as unknown as Socket, room_id, limit);
      const opponentId = (opponent as any).data?.player_id as string | undefined;
      if (opponentId && !result.finished) {
        this.webPush.notifyYourTurn(opponentId, 'chess', room_id);
      }
    }
    
    room.turn_start_time = new Date();
    await room.save();
    
    if (room.status === 'finished') {
      return client.emit('chess', { success: false, messages: [this.i18n.translate('ws.games.roomInactive', lang)] });
    }

    if (result.finished) {
      room.status = 'finished'; room.winner_reason = result.reason; room.finished_at = new Date();
      if (result.winner) {
        const winnerId = result.winner === 1 ? game.player1_id : game.player2_id;
        room.winner = winnerId;
        const grossPayout = winnerGrossPayout(
          room.bet_amount,
          room.house_edge,
          room.players.length,
        );
        await this.userModel.updateOne({ _id: winnerId }, winnerBalanceUpdate(grossPayout));
      }
      await room.save();
      if (result.winner) {
        const winnerId = result.winner === 1 ? game.player1_id : game.player2_id;
        await this.tournamentMatchService?.tryCompleteFromFinishedRoom(
          room,
          winnerId.toString(),
          result.reason || 'normal',
        );
      }
      clearTimer(client.id);

      const gameId = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
      if (gameId) this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
    }

    const p1Id = room.players[0]?.playerId?.toString();
    const p2Id = room.players[1]?.playerId?.toString();
    const player1Name = p1Id ? await this.getCachedUsername(p1Id) : 'Unknown';
    const player2Name = p2Id ? await this.getCachedUsername(p2Id) : 'Unknown';
    const shotFrom = movingPlayerUsername;

    const displayPrize = winnerDisplayedPrize(
      room.bet_amount,
      room.house_edge,
      room.players.length,
    );

    const inCheckNow = isCheck(game.current_player === 1 ? COLORS.WHITE : COLORS.BLACK, nextBoard, nextState);
    const myCastling = this.getCastlingAvailable(nextBoard, nextState, playerNum as 1 | 2);

    for (const s of sockets) {
      const sLang = this.getLang(s as unknown as Socket);
      const sPNum = (s as any).data.playerNum || 0;
      const sIsSpectator = (s as any).data.isSpectator || false;
      const isWinner = result.winner === sPNum;
      const isDraw = result.finished && !result.winner;
      
      const sData: any = { 
        board: nextBoard, lastMove: { from, to }, yourTurn: !sIsSpectator && sPNum === game.current_player && !result.finished, 
        turnTimerSeconds: limit, turn_start_time: room.turn_start_time, inCheck: inCheckNow,
        outcome: result.finished ? (result.winner ? (isWinner ? 'win' : 'lose') : 'draw') : '', 
        youWon: !isDraw && isWinner && !sIsSpectator, 
        gameEnded: result.finished, 
        winner: result.winner === 1 ? game.player1_id : (result.winner === 2 ? game.player2_id : null), 
        reason: result.reason, isPlayerOne: sPNum === 1, playingWhite: sPNum === 1, 
        prize: (result.finished && isWinner) ? displayPrize : 0, 
        castlingAvailable: sIsSpectator ? { white: { short: true, long: true }, black: { short: true, long: true } } : this.getCastlingAvailable(nextBoard, nextState, sPNum as 1 | 2),
        isSpectator: sIsSpectator
      };
      
      if (sIsSpectator) { 
         sData.player1 = player1Name; sData.player2 = player2Name; sData.shotFrom = shotFrom;
         sData.turnOf = game.current_player === 1 ? player1Name : player2Name;
         sData.winner = result.winner === 1 ? player1Name : (result.winner === 2 ? player2Name : null);
      }

      let msg = '';
      if (result.finished) {
        msg = isDraw ? this.i18n.translate('ws.games.drawGeneric', sLang) : (isWinner ? this.i18n.translate('ws.games.win', sLang) : this.i18n.translate('ws.games.lose', sLang));
        if (sIsSpectator && result.winner) msg = this.i18n.translate('ws.games.wins', sLang, { username: sData.winner });
      } else {
        msg = inCheckNow ? this.i18n.translate('ws.chess.check', sLang) : (s.id === client.id ? this.i18n.translate('ws.games.moveAccepted', sLang) : this.i18n.translate('ws.games.opponentMoved', sLang));
      }

      (s as unknown as Socket).emit('chess', {
        success: true,
        data: await enrichGamePayload(this.redis, 'chess', room_id, sData, {
          turnStart: room.turn_start_time,
          timerSeconds: limit,
        }),
        messages: [msg],
      });
    }
  }

  @SubscribeMessage('end_turn')
  async handleEndTurn(@ConnectedSocket() client: Socket, @MessageBody() payload: { room_id: string }) {
    const lang = this.getLang(client);
    return client.emit('chess', { success: false, messages: [this.i18n.translate('ws.games.chessAutoTurn', lang)] });
  }


  private startTimer(socket: Socket, room_id: string, seconds: number) {
    clearTimer(socket.id);
    const playerId = (socket.data.player_id as string) || '';
    if (playerId) void this.turnDeadlines.schedule('chess', room_id, playerId, seconds);
    const t = setTimeout(() => void this.executeTurnTimeout(room_id, socket.id), seconds * 1000);
    turnTimers.set(socket.id, t);
  }

  private async executeTurnTimeout(room_id: string, socketId?: string): Promise<void> {
    if (socketId) clearTimer(socketId);
    await this.turnDeadlines.cancel('chess', room_id);
      const game = await this.chessGameModel.findOne({ room_id: new Types.ObjectId(room_id) });
      if (!game) return;
      const winnerNum = game.current_player === 1 ? 2 : 1;
      const winnerId = winnerNum === 1 ? game.player1_id : game.player2_id;
      const room = await this.roomModel.findById(room_id);
      if (room && room.status === 'started') {
        room.status = 'finished'; room.winner = winnerId; room.winner_reason = 'timeout'; room.finished_at = new Date();
        await room.save();
        await this.tournamentMatchService?.tryCompleteFromFinishedRoom(
          room,
          winnerId.toString(),
          'timeout',
        );
        const grossPayout = winnerGrossPayout(
          room.bet_amount,
          room.house_edge,
          room.players.length,
        );
        const displayPrize = winnerDisplayedPrize(
          room.bet_amount,
          room.house_edge,
          room.players.length,
        );
        await this.userModel.updateOne({ _id: winnerId }, winnerBalanceUpdate(grossPayout));
        
        const sockets = await this.server.in(room_id).fetchSockets();
        const winnerUsername = await this.getCachedUsername(winnerId.toString());
        for (const s of sockets) {
          const sIsSpectator = (s as any).data.isSpectator || false;
          const isWinnerFound = (s as any).data.playerNum === winnerNum;
          const sLang = this.getLang(s as unknown as Socket);

          (s as unknown as Socket).emit('chess', {
            success: true,
            data: {
              gameEnded: true, outcome: isWinnerFound ? 'win' : 'timeout_loss', youWon: isWinnerFound && !sIsSpectator,
              winner: sIsSpectator ? winnerUsername : winnerId, reason: 'timeout', prize: isWinnerFound ? displayPrize : 0, isSpectator: sIsSpectator
            },
            messages: sIsSpectator ? [this.i18n.translate('ws.games.winsTimeout', sLang, { username: winnerUsername })] : [isWinnerFound ? this.i18n.translate('ws.games.timeoutWin', sLang) : this.i18n.translate('ws.games.timeoutLoss', sLang)]
          });
        }
        
        const gameId = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
        if (gameId) this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
      }
  }
}
