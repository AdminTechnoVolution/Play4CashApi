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

  constructor(
    @InjectModel(ChessGame.name) private readonly chessGameModel: Model<ChessGameDocument>,
    @InjectModel('Room') private readonly roomModel: Model<any>,
    @InjectModel('User') private readonly userModel: Model<any>,
    private readonly config: ConfigService,
    private readonly roomsGateway: RoomsGateway,
    @Inject(REDIS_CLIENT) private readonly redis: any,
  ) {}

  afterInit(server: Server) { applyWsAuth(server, this.config.get<string>('jwt.secret')!, this.redis); }

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

    const room = await this.roomModel.findOne({ _id: roomObjId, 'players.playerId': playerObjId });
    if (!room || room.status === 'finished') return;

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
        client.to(room_id).emit('chess', { success: true, messages: ['Opponent left the lobby.'], data: { opponentLeft: true, waitingForOpponent: true } });
      }
      return;
    }

    if (room.status === 'started') {
      const winner_id = room.players.find((p: any) => p.playerId.toString() !== player_id.toString())?.playerId;
      if (!winner_id) return;
      room.status = 'finished'; room.winner = winner_id; room.winner_reason = 'forfeit'; room.finished_at = new Date();
      await room.save();
      const prize = room.bet_amount * (2 - room.house_edge / 100);
      await this.userModel.findByIdAndUpdate(winner_id, { $inc: { balance: prize } });
      client.to(room_id).emit('chess', {
    success: false, messages: ['Your opponent disconnected. You win!'],
    data: { outcome: 'opponent_disconnected', gameEnded: true },
});
      const gameId = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
      if (gameId) this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
    }
  }

  @SubscribeMessage('join')
  async handleJoin(@ConnectedSocket() client: Socket, @MessageBody() payload: { room_id: string }) {
    if (!payload?.room_id) return client.emit('chess', { success: false, messages: ['Missing room_id'] });
    const { room_id } = payload;
    const player_id = client.data.player_id;

    const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds');
    if (!room) return client.emit('chess', { success: false, messages: ['Room not found.'] });
    if (room.status === 'finished') return client.emit('chess', { success: false, messages: ['Room is no longer active.'] });

    const isMember = room.players.some((p: any) => p.playerId.toString() === player_id);
    if (!isMember) return client.emit('chess', { success: false, messages: ['You are not a member of this room.'] });

    await client.join(room_id);
    const playerIndex = room.players.findIndex((p: any) => p.playerId.toString() === player_id);
    const playerNum = playerIndex === 0 ? 1 : 2;
    client.data.playerNum = playerNum;
    client.data.room_id = room_id;

    if (room.status === 'started') {
      const game = await this.chessGameModel.findOne({ room_id });
      const timerSeconds = (game && room.game_id?.turn_timer_seconds) ? room.game_id.turn_timer_seconds : 30;
      const isMyTurn = game ? game.current_player === playerNum : playerNum === 1;
      const currentBoard = game ? game.board : createInitialBoard();
      const currentState = game ? game.toObject() as any : { current_player: 1, castling_rights: { wK:true,wQ:true,bK:true,bQ:true }, en_passant_target: null };
      return client.emit('chess', { success: true, messages: [], data: {
        board: currentBoard,
        yourTurn: isMyTurn, turnTimerSeconds: timerSeconds,
        waitingForOpponent: false, isPlayerOne: playerNum === 1, playingWhite: playerNum === 1, gameStarted: true, youWon: false,
        castlingAvailable: this.getCastlingAvailable(currentBoard, currentState, playerNum as 1 | 2),
      }});
    }

    client.emit('chess', { success: true, messages: ['Joined room. Waiting for opponent.'], data: { room_id, waitingForOpponent: true, isPlayerOne: playerNum === 1 } });

    const socketsInRoom = await this.server.in(room_id).fetchSockets();
    if (socketsInRoom.length > 1) {
      const user = await this.userModel.findById(player_id).select('username');
      const username = user?.username || 'Opponent';
      client.to(room_id).emit('chess', { success: true, messages: [`${username} joined!`], data: { opponentJoined: true, opponentName: username } });
    }

    if (socketsInRoom.length >= 2) {
      const started = await this.roomModel.findOneAndUpdate({ _id: room_id, status: 'waiting' }, { $set: { status: 'started' } }, { returnDocument: 'after' });
      if (!started) return;

      const [p1id, p2id] = [room.players[0].playerId, room.players[1].playerId];
      const [d1, d2] = await Promise.all([
        this.userModel.findOneAndUpdate({ _id: p1id, balance: { $gte: room.bet_amount } }, { $inc: { balance: -room.bet_amount } }),
        this.userModel.findOneAndUpdate({ _id: p2id, balance: { $gte: room.bet_amount } }, { $inc: { balance: -room.bet_amount } }),
      ]);
      if (!d1 || !d2) {
        if (d1) await this.userModel.updateOne({ _id: p1id }, { $inc: { balance: room.bet_amount } });
        if (d2) await this.userModel.updateOne({ _id: p2id }, { $inc: { balance: room.bet_amount } });
        await this.roomModel.findByIdAndUpdate(room_id, { $set: { status: 'waiting' } });
        this.server.to(room_id).emit('chess', { success: false, messages: ['Insufficient balance to start.'] });
        return;
      }

      const board = createInitialBoard();
      await this.chessGameModel.create({ room_id, player1_id: p1id, player2_id: p2id, board, current_player: 1, castling_rights: { wK:true,wQ:true,bK:true,bQ:true }, en_passant_target: null, turn_start_time: new Date() });
      const timerSeconds = room.game_id?.turn_timer_seconds ?? 30;

      const initialState: GameState = { current_player: 1, castling_rights: { wK:true,wQ:true,bK:true,bQ:true }, en_passant_target: null };
      for (const s of socketsInRoom) {
        const pNum = (s as any).data.playerNum;
        const isFirst = pNum === 1;
        (s as unknown as Socket).emit('chess', { success: true, data: { board, yourTurn: isFirst, turnTimerSeconds: timerSeconds, waitingForOpponent: false, isPlayerOne: isFirst, playingWhite: isFirst, gameStarted: true, youWon: false,
          castlingAvailable: this.getCastlingAvailable(board, initialState, pNum as 1 | 2) },
          messages: [isFirst ? 'Game started! Your turn.' : 'Game started! Waiting for opponent.'] });
        if (isFirst) this.startTimer(s as unknown as Socket, room_id, timerSeconds);
      }
    }
  }

  @SubscribeMessage('move')
  async handleMove(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
    const { room_id, promotion } = payload;
    let { from, to } = payload;

    // Support legacy payload format
    if (!from && payload.from_row !== undefined && payload.from_col !== undefined) {
      from = { row: Number(payload.from_row), col: Number(payload.from_col) };
    }
    if (!to && payload.to_row !== undefined && payload.to_col !== undefined) {
      to = { row: Number(payload.to_row), col: Number(payload.to_col) };
    }

    const playerNum = client.data.playerNum;
    if (!room_id || !from || !to || from.row === undefined || from.col === undefined || to.row === undefined || to.col === undefined) {
      return client.emit('chess', { success: false, messages: ['Invalid payload'] });
    }

    const game = await this.chessGameModel.findOne({ room_id: new Types.ObjectId(room_id) });
    if (!game) return client.emit('chess', { success: false, messages: ['Game not found'] });
    if (game.current_player !== playerNum) return client.emit('chess', { success: false, messages: ['Not your turn.'] });

    const legalMoves = getLegalMoves(from.row, from.col, game.board, game.toObject() as any);
    const move = legalMoves.find((m: any) => m.to.row === to.row && m.to.col === to.col);
    if (!move) return client.emit('chess', { success: false, messages: ['Illegal move.'], data: { board: game.board, yourTurn: true } });
    if (promotion) move.promotion = promotion;

    const { nextBoard, nextState } = applyMove(move, game.board, game.toObject() as any);
    const result = getGameResult(nextBoard, nextState);

    game.board = nextBoard;
    game.current_player = nextState.current_player;
    game.castling_rights = nextState.castling_rights;
    game.en_passant_target = nextState.en_passant_target;
    game.history.push({ from, to, moveType: move.castle ? 'castle' : move.enPassant ? 'enPassant' : 'normal' });
    game.turn_start_time = new Date();

    // Record move in Room history
    await this.roomModel.updateOne(
      { _id: new Types.ObjectId(room_id), 'players.playerId': new Types.ObjectId(client.data.player_id) },
      { $push: { 'players.$.moves': { data: { from, to, type: 'move' } } } }
    );

    const room = await this.roomModel.findById(room_id);
    if (!room) return client.emit('chess', { success: false, messages: ['Room not found'] });

    if (result.finished) {
      room.status = 'finished'; room.winner_reason = result.reason; room.finished_at = new Date();
      if (result.winner) {
        const winner_id = result.winner === 1 ? game.player1_id : game.player2_id;
        room.winner = winner_id;
        const prize = room.bet_amount + (room.bet_amount * (1 - room.house_edge / 100));
        await this.userModel.updateOne({ _id: winner_id }, { $inc: { balance: prize } });
      }
      await room.save();
      clearTimer(client.id);

      const gameId = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
      if (gameId) this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
    }
    await game.save();

    const timerSec = 30;
    const inCheck = isCheck(playerNum === 1 ? COLORS.WHITE : COLORS.BLACK, nextBoard, nextState);
    const opponentNum = playerNum === 1 ? 2 : 1;
    const myCastling = this.getCastlingAvailable(nextBoard, nextState, playerNum as 1 | 2);
    const oppCastling = this.getCastlingAvailable(nextBoard, nextState, opponentNum as 1 | 2);

    client.emit('chess', { success: true, data: { board: nextBoard, lastMove: { from, to }, yourTurn: true, turnTimerSeconds: timerSec, mustEndTurn: !result.finished, outcome: result.finished ? (result.winner ? (result.winner === playerNum ? 'win' : 'lose') : 'draw') : '', youWon: result.finished ? (result.winner === playerNum) : false, gameEnded: result.finished, winner: result.winner === 1 ? game.player1_id : (result.winner === 2 ? game.player2_id : null), reason: result.reason, isPlayerOne: playerNum === 1, playingWhite: playerNum === 1, prize: (result.finished && result.winner === playerNum) ? (room.bet_amount * (2 - room.house_edge / 100)) : 0, castlingAvailable: myCastling }, messages: [inCheck ? 'Check!' : 'Move accepted.'] });
    client.to(room_id).emit('chess', { success: true, data: { board: nextBoard, lastMove: { from, to }, yourTurn: false, turnTimerSeconds: timerSec, outcome: result.finished ? (result.winner ? (result.winner !== playerNum ? 'win' : 'lose') : 'draw') : '', youWon: result.finished ? (result.winner !== playerNum) : false, gameEnded: result.finished, winner: result.winner === 1 ? game.player1_id : (result.winner === 2 ? game.player2_id : null), reason: result.reason, isPlayerOne: playerNum !== 1, playingWhite: playerNum !== 1, prize: (result.finished && result.winner && result.winner !== playerNum) ? (room.bet_amount * (2 - room.house_edge / 100)) : 0, castlingAvailable: oppCastling }, messages: [result.finished ? 'Game over!' : 'Opponent moved.'] });
  }

  @SubscribeMessage('end_turn')
  async handleEndTurn(@ConnectedSocket() client: Socket, @MessageBody() payload: { room_id: string }) {
    const { room_id } = payload;
    const playerNum = client.data.playerNum;
    if (!room_id) return;
    const game = await this.chessGameModel.findOne({ room_id: new Types.ObjectId(room_id) });
    if (!game || game.current_player !== playerNum) return;
    const nextPlayer = playerNum === 1 ? 2 : 1;
    game.current_player = nextPlayer as 1 | 2;
    game.turn_start_time = new Date();
    await game.save();

    await this.roomModel.updateOne(
      { _id: new Types.ObjectId(room_id), 'players.playerId': new Types.ObjectId(client.data.player_id) },
      { $push: { 'players.$.moves': { data: { type: 'end_turn' } } } }
    );

    const sockets = await this.server.in(room_id).fetchSockets();
    const opponent = sockets.find(s => (s as any).data.playerNum === nextPlayer);
    clearTimer(client.id);
    const timerSec = 30;
    if (opponent) this.startTimer(opponent as unknown as Socket, room_id, timerSec);

    const endTurnState = game.toObject() as any;
    const myEndCastling = this.getCastlingAvailable(game.board, endTurnState, playerNum as 1 | 2);
    const oppEndCastling = this.getCastlingAvailable(game.board, endTurnState, nextPlayer as 1 | 2);

    client.emit('chess', { success: true, data: { board: game.board, yourTurn: false, outcome: '', turnTimerSeconds: timerSec, isPlayerOne: playerNum === 1, playingWhite: playerNum === 1, castlingAvailable: myEndCastling }, messages: ['Turn ended.'] });
    client.to(room_id).emit('chess', { success: true, data: { board: game.board, yourTurn: true, outcome: '', turnTimerSeconds: timerSec, isPlayerOne: nextPlayer === 1, playingWhite: nextPlayer === 1, castlingAvailable: oppEndCastling }, messages: ['Opponent ended their turn. Your turn!'] });
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
        const prize = room.bet_amount * (2 - room.house_edge / 100);
        const sockets = await this.server.in(room_id).fetchSockets();
        for (const s of sockets) {
          const socketPlayerId = (s as any).data.player_id;
          const isWinner = socketPlayerId === winnerId.toString();
          (s as unknown as Socket).emit('chess', {
            success: true,
            data: {
              gameEnded: true,
              outcome: isWinner ? 'win' : 'timeout_loss',
              youWon: isWinner,
              winner: winnerId,
              reason: 'timeout',
              prize: isWinner ? (room.bet_amount * (2 - room.house_edge / 100)) : 0,
              isPlayerOne: (s as any).data.playerNum === 1,
              playingWhite: (s as any).data.playerNum === 1,
            },
            messages: [isWinner ? 'Opponent timed out. You win!' : 'Turn time expired. You lose.']
          });
        }
        
        const gameId = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
        if (gameId) this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
      }
    }, seconds * 1000);
    turnTimers.set(socket.id, t);
  }
}
