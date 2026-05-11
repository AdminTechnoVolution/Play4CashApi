import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  MessageBody, ConnectedSocket, OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit,
} from '@nestjs/websockets';
import { Inject, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { Model, Types } from 'mongoose';
import { applyWsAuth } from '../../../common/guards/ws-auth.middleware';
import { REDIS_CLIENT } from '../../../common/redis/redis.module';
import { RoomsGateway } from '../rooms/rooms.gateway';
import { ChessGame, ChessGameDocument } from './schemas/chess-game.schema';
import { I18nService } from '../../../common/i18n/i18n.service';
import { winnerGrossPayout, winnerDisplayedPrize } from '../../../common/utils/game-prize.util';
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

// Timer map stored in-memory per pod (acceptable for single-instance deployments)
const turnTimers = new Map<string, ReturnType<typeof setTimeout>>();

function clearTimer(socketId: string) {
  const t = turnTimers.get(socketId);
  if (t) { clearTimeout(t); turnTimers.delete(socketId); }
}

@WebSocketGateway({ namespace: '/chess', cors: { origin: '*', credentials: true } })
export class ChessGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
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
  ) {}

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
      if (updated.players.length === 0) {
        await this.roomModel.findOneAndDelete({ _id: room_id, players: { $size: 0 } });
        this.server.serverSideEmit?.('roomDeleted', { id: room_id });
      } else {
        const sLang = this.getLang(client);
        client.to(room_id).emit('chess', { success: true, messages: [this.i18n.translate('ws.games.opponentLeft', sLang)], data: { opponentLeft: true, waitingForOpponent: true } });
      }
      return;
    }

    if (room.status === 'started') {
      const redisKey = `grace_period:chess:${player_id}`;
      // Calculate remaining turn time if game supports it, otherwise default 60s
      const game = await this.chessGameModel.findOne({ room_id: roomObjId });
      let gracePeriod = 60;
      
      if (game) {
        const turnStart = game.turn_start_time?.getTime();
        const limit = (room.game_id?.turn_timer_seconds || 30) * 1000;
        if (turnStart) {
          const elapsed = Date.now() - turnStart;
          gracePeriod = Math.max(5, Math.ceil((limit - elapsed) / 1000));
        }
      }

      await this.redis.set(redisKey, JSON.stringify({ room_id }), 'EX', gracePeriod);
      this.logger.log(`[Chess] ⏳ Grace period started | player=${player_id} | room=${room_id} | seconds=${gracePeriod}`);

      // Schedule definitive forfeit if not reconnected
      setTimeout(async () => {
        const stillDisconnected = await this.redis.get(redisKey);
        if (stillDisconnected) {
          this.logger.log(`[Chess] 🚪 Grace period EXPIRED, forfeiting player=${player_id}`);
          await this.redis.del(redisKey);
          await this.executeForfeit(room_id, player_id);
        }
      }, gracePeriod * 1000);
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

    const pc = room.players.length;
    const grossPayout = winnerGrossPayout(room.bet_amount, room.house_edge, pc);
    await this.userModel.findByIdAndUpdate(winner_id, { $inc: { balance: grossPayout } });

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

    // Check for reconnection session in Redis
    let room_id = payload?.room_id;
    const redisKey = `grace_period:chess:${player_id}`;
    const reconData = await this.redis.get(redisKey);

    if (reconData) {
      const parsed = JSON.parse(reconData);
      room_id = parsed.room_id;
      await this.redis.del(redisKey);
      this.logger.log(`[Chess] 🔄 Reconnection detected | player=${player_id} | room=${room_id}`);
    }

    if (!room_id) return client.emit('chess', { success: false, messages: [this.i18n.translate('ws.invalidMessageFormat', lang)] });
    
    const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds');
    if (!room) return client.emit('chess', { success: false, messages: [this.i18n.translate('ws.games.gameNotFound', lang)] });
    if (room.status === 'finished') return client.emit('chess', { success: false, messages: [this.i18n.translate('ws.games.roomInactive', lang)] });

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

    client.emit('chess', { success: true, messages: [this.i18n.translate('ws.games.waitingOpponent', lang)], data: { room_id, waitingForOpponent: true, isPlayerOne: playerNum === 1, isSpectator: false } });

    const socketsInRoom = await this.server.in(room_id).fetchSockets();
    if (socketsInRoom.length > 1) {
      const user = await this.userModel.findById(player_id).select('username');
      const username = user?.username || 'Opponent';
      client.to(room_id).emit('chess', { success: true, messages: [this.i18n.translate('ws.games.opponentJoined', lang, { username })], data: { opponentJoined: true, opponentName: username } });
    }

    if (socketsInRoom.length >= 2 && room.status === 'waiting') {
      const started = await this.roomModel.findOneAndUpdate({ _id: room_id, status: 'waiting' }, { $set: { status: 'started' } }, { returnDocument: 'after' });
      if (!started) return;

      const [p1id, p2id] = [room.players[0].playerId, room.players[1].playerId];
      const [player1User, player2User] = await Promise.all([
        this.userModel.findById(p1id),
        this.userModel.findById(p2id)
      ]);

      const p1Balance = player1User?.balance || 0;
      const p2Balance = player2User?.balance || 0;

      if (p1Balance < room.bet_amount || p2Balance < room.bet_amount) {
        if (player1User && p1Balance >= room.bet_amount) { /* dummy */ }
        await this.roomModel.findByIdAndUpdate(room_id, { $set: { status: 'waiting' } });
        this.server.to(room_id).emit('chess', { success: false, messages: [this.i18n.translate('ws.games.insufficientBalance', lang)] });
        return;
      }

      await Promise.all([
        this.userModel.updateOne({ _id: p1id }, { $inc: { balance: -room.bet_amount } }),
        this.userModel.updateOne({ _id: p2id }, { $inc: { balance: -room.bet_amount } }),
      ]);

      const board = createInitialBoard();
      await this.chessGameModel.create({ room_id, player1_id: p1id, player2_id: p2id, board, current_player: 1, castling_rights: { wK:true,wQ:true,bK:true,bQ:true }, en_passant_target: null, turn_start_time: new Date() });
      const timerSeconds = room.game_id?.turn_timer_seconds ?? 30;

      const initialState: GameState = { current_player: 1, castling_rights: { wK:true,wQ:true,bK:true,bQ:true }, en_passant_target: null };
      for (const s of socketsInRoom) {
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
    if (opponent) this.startTimer(opponent as unknown as Socket, room_id, limit);
    
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
        await this.userModel.updateOne({ _id: winnerId }, { $inc: { balance: grossPayout } });
      }
      await room.save();
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

      (s as unknown as Socket).emit('chess', { success: true, data: sData, messages: [msg] });
    }
  }

  @SubscribeMessage('end_turn')
  async handleEndTurn(@ConnectedSocket() client: Socket, @MessageBody() payload: { room_id: string }) {
    const lang = this.getLang(client);
    return client.emit('chess', { success: false, messages: [this.i18n.translate('ws.games.chessAutoTurn', lang)] });
  }


  private startTimer(socket: Socket, room_id: string, seconds: number) {
    clearTimer(socket.id);
    const t = setTimeout(async () => {
      const game = await this.chessGameModel.findOne({ room_id: new Types.ObjectId(room_id) });
      if (!game) return;
      const winnerNum = game.current_player === 1 ? 2 : 1;
      const winnerId = winnerNum === 1 ? game.player1_id : game.player2_id;
      const room = await this.roomModel.findById(room_id);
      if (room && room.status === 'started') {
        room.status = 'finished'; room.winner = winnerId; room.winner_reason = 'timeout'; room.finished_at = new Date();
        await room.save();
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
        await this.userModel.updateOne({ _id: winnerId }, { $inc: { balance: grossPayout } });
        
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
    }, seconds * 1000);
    turnTimers.set(socket.id, t);
  }
}
