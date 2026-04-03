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
import { HalmaGame, HalmaGameDocument } from './schemas/halma-game.schema';
import { createHalmaBoard, isValidStep, isValidJump, canJumpFurther, HalmaBoard, P1_NORMAL, P2_NORMAL, P1_KING, P2_KING, isOwner } from './halma-game.logic';

const turnTimers = new Map<string, ReturnType<typeof setTimeout>>();
const clearTimer = (id: string) => { const t = turnTimers.get(id); if (t) { clearTimeout(t); turnTimers.delete(id); } };

@WebSocketGateway({ namespace: '/halma', cors: { origin: '*', credentials: true } })
export class HalmaGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(HalmaGateway.name);
  private usernameCache = new Map<string, string>();

  private async getCachedUsername(userId: string): Promise<string> {
    if (this.usernameCache.has(userId)) return this.usernameCache.get(userId)!;
    const user = await this.userModel.findById(userId).select('username').lean();
    const username = user?.username || 'Unknown';
    if (user) this.usernameCache.set(userId, username);
    return username;
  }

  constructor(
    @InjectModel(HalmaGame.name) private readonly halmaModel: Model<HalmaGameDocument>,
    @InjectModel('Room') private readonly roomModel: Model<any>,
    @InjectModel('User') private readonly userModel: Model<any>,
    private readonly config: ConfigService,
    private readonly roomsGateway: RoomsGateway,
    @Inject(REDIS_CLIENT) private readonly redis: any,
  ) {}

  afterInit(server: Server) { applyWsAuth(server, this.config.get<string>('jwt.secret')!, this.redis); }

  handleConnection(client: Socket) { this.logger.log(`[Halma] Connected: ${client.id}`); }

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
      client.to(room_id).emit('halma', { success: true, data: { spectatorsCount: updated?.spectators?.length || 0 }, messages: [] });
      return;
    }

    if (room.status === 'waiting') {
      const updated = await this.roomModel.findOneAndUpdate({ _id: roomObjId, 'players.playerId': playerObjId }, { $pull: { players: { playerId: playerObjId } } }, { returnDocument: 'after' });
      if (updated?.players.length === 0) await this.roomModel.findOneAndDelete({ _id: roomObjId, players: { $size: 0 } });
      else client.to(room_id).emit('halma', { success: true, data: { opponentLeft: true }, messages: ['Opponent left.'] });
      return;
    }
    if (room.status === 'started') {
      const winner_id = room.players.find((p: any) => p.playerId.toString() !== player_id)?.playerId;
      if (!winner_id) return;
      room.status = 'finished'; room.winner = winner_id; room.winner_reason = 'forfeit'; room.finished_at = new Date();
      await room.save();
      const prize = room.bet_amount * (2 - room.house_edge / 100);
      await this.userModel.findByIdAndUpdate(winner_id, { $inc: { balance: prize } });
      const winnerUsername = await this.getCachedUsername(winner_id.toString());
      const sockets = await this.server.in(room_id).fetchSockets();
      for (const s of sockets) {
        const sIsSpectator = (s as any).data.isSpectator || false;
        (s as unknown as Socket).emit('halma', {
          success: false, 
          data: { 
            outcome: 'opponent_disconnected', 
            gameEnded: true,
            winner: sIsSpectator ? winnerUsername : winner_id,
            isSpectator: sIsSpectator
          }, 
          messages: sIsSpectator ? ['A player disconnected. Game over.'] : ['Opponent disconnected. You win!'] 
        });
      }

      const gameId = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
      if (gameId) this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
    }
  }

  @SubscribeMessage('join')
  async handleJoin(@ConnectedSocket() client: Socket, @MessageBody() payload: { room_id: string }) {
    if (!payload?.room_id) return client.emit('halma', { success: false, messages: ['Missing room_id'] });
    const { room_id } = payload;
    const player_id = client.data.player_id;

    const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds max_players');
    if (!room) return client.emit('halma', { success: false, messages: ['Room not found.'] });

    const isMember = room.players.some((p: any) => p.playerId.toString() === player_id);
    const isSpectator = room.spectators?.some((id: any) => id.toString() === player_id);
    if (!isMember && !isSpectator) return client.emit('halma', { success: false, messages: ['Not in room.'] });

    await client.join(room_id);
    client.data.room_id = room_id;
    client.data.isSpectator = !isMember;

    if (client.data.isSpectator) {
      this.logger.log(`[Halma] 👀 Spectator joined | room=${room_id} | player=${player_id}`);
      const game = await this.halmaModel.findOne({ room_id });
      if (game) {
        const p1Id = room.players[0]?.playerId?.toString();
        const player1 = p1Id ? await this.getCachedUsername(p1Id) : 'Unknown';
        const p2Id = room.players[1]?.playerId?.toString();
        const player2 = p2Id ? await this.getCachedUsername(p2Id) : 'Unknown';

        const shotFrom = game.current_player === 1 ? player1 : player2;
        
        const now = new Date();
        const elapsed = Math.floor((now.getTime() - game.turn_start_time.getTime()) / 1000);
        const remaining = Math.max(0, 30 - elapsed);

        client.emit('halma', { success: true, messages: [], data: {
          board: game.board,
          pendingCaptures: game.pending_captures || [],
          yourTurn: false, turnTimerSeconds: remaining,
          waitingForOpponent: false, isPlayerOne: false, gameStarted: true, youWon: false,
          isSpectator: true,
          spectatorsCount: room.spectators.length,
          player1, player2,
          shotFrom,
          turnOf: shotFrom,
          history: room.players.flatMap((p, i) => p.moves.map(m => ({ ...m.data, player: i === 0 ? player1 : player2 })))
        }});
        client.to(room_id).emit('halma', { success: true, data: { spectatorsCount: room.spectators.length }, messages: [] });
        return;
      }
      return client.emit('halma', { success: false, messages: ['Game not found'] });
    }

    const playerIndex = room.players.findIndex((p: any) => p.playerId.toString() === player_id);
    const playerNum = playerIndex + 1;
    client.data.playerNum = playerNum;

    if (room.status === 'started') {
      const game = await this.halmaModel.findOne({ room_id });
      if (game) {
        const isMyTurn = game.current_player === playerNum;
        const now = new Date();
        const elapsed = Math.floor((now.getTime() - game.turn_start_time.getTime()) / 1000);
        const remaining = Math.max(0, 30 - elapsed);
        return client.emit('halma', { success: true, messages: [], data: {
          board: game.board,
          yourTurn: isMyTurn, turnTimerSeconds: remaining,
          waitingForOpponent: false, isPlayerOne: playerNum === 1, gameStarted: true, youWon: false, isSpectator: false
        }});
      }
    }

    client.emit('halma', { success: true, data: { waitingForOpponent: true, isPlayerOne: playerNum === 1, isSpectator: false }, messages: ['Waiting for opponent.'] });

    const socketsInRoom = await this.server.in(room_id).fetchSockets();
    if (socketsInRoom.length > 1) {
      const user = await this.userModel.findById(player_id).select('username');
      const username = user?.username || 'Opponent';
      client.to(room_id).emit('halma', { success: true, data: { opponentJoined: true, opponentName: username }, messages: [`${username} joined!`] });
    }

    const maxPlayers = room.player_limit || room.game_id?.max_players || 2;

    if (socketsInRoom.length >= maxPlayers && room.status === 'waiting') {
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
        this.server.to(room_id).emit('halma', { success: false, messages: ['Insufficient balance.'] });
        return;
      }

      const board = createHalmaBoard();
      await this.halmaModel.create({ room_id, player1_id: p1id, player2_id: p2id, board, current_player: 1, turn_start_time: new Date() });

      for (const s of socketsInRoom) {
        const pNum = (s as any).data.playerNum;
        const isTurn = pNum === 1;
        const sIsSpectator = (s as any).data.isSpectator || false;
        (s as unknown as Socket).emit('halma', { success: true, data: { board, yourTurn: isTurn && !sIsSpectator, isPlayerOne: pNum === 1, gameStarted: true, turnTimerSeconds: 30, isSpectator: sIsSpectator }, messages: sIsSpectator ? ['Game started!'] : [isTurn ? 'Your turn!' : 'Waiting for opponent.'] });
        if (isTurn) this.startTimer(s as unknown as Socket, room_id, 30);
      }
      const gId = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
      const populated = await this.roomModel.findById(room_id).populate('game_id', '-created_at').populate('players.playerId', 'username').lean();
      if (gId) this.roomsGateway.broadcastRoomUpdate(gId, 'roomUpdated', populated);
    }
  }

  @SubscribeMessage('move')
  async handleMove(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
    if (client.data.isSpectator) return client.emit('halma', { success: false, messages: ['Spectators cannot perform actions.'] });
    const { room_id } = payload;
    let from = payload.from;
    let to = payload.to;

    if (!from && payload.from_row !== undefined && payload.from_col !== undefined) {
      from = [Number(payload.from_row), Number(payload.from_col)];
    }
    if (!to && payload.to_row !== undefined && payload.to_col !== undefined) {
      to = [Number(payload.to_row), Number(payload.to_col)];
    }

    this.logger.log(`[Halma] ⭐ Move received | room=${room_id} | player=${client.data.player_id}`);
    const playerNum = client.data.playerNum || 1;

    if (!room_id || !from || !to || !Array.isArray(from) || !Array.isArray(to) || from.length !== 2 || to.length !== 2) {
      return client.emit('halma', { success: false, messages: ['Invalid move payload.'] });
    }
    const game = await this.halmaModel.findOne({ room_id: new Types.ObjectId(room_id) });
    if (!game) return client.emit('halma', { success: false, messages: ['Game not found'] });
    if (game.current_player !== playerNum) return client.emit('halma', { success: false, messages: ['Not your turn.'] });

    const board = game.board as HalmaBoard;
    const [fr, fc] = from;
    const [tr, tc] = to;
    const isStep = isValidStep(board, fr, fc, tr, tc, playerNum);
    const isJump = isValidJump(board, fr, fc, tr, tc);
    if (!isStep && !isJump) return client.emit('halma', { success: false, messages: ['Invalid move.'], data: { board } });

    // Execute Move
    board[tr][tc] = board[fr][fc];
    board[fr][fc] = 0;

    // 1. Promotion logic: check if piece reached last row
    if (playerNum === 1 && tr === 7 && board[tr][tc] === P1_NORMAL) {
      board[tr][tc] = P1_KING;
    } else if (playerNum === 2 && tr === 0 && board[tr][tc] === P2_NORMAL) {
      board[tr][tc] = P2_KING;
    }

    // 2. Chain check (using promoted piece if applicable)
    const chainPossible = isJump && canJumpFurther(board, tr, tc);

    // 3. Capture logic (toggle)
    if (isJump) {
      const dr = tr - fr;
      const dc = tc - fc;
      const absDr = Math.abs(dr);
      const unitR = dr / absDr;
      const unitC = dc / absDr;

      let midR = -1;
      let midC = -1;
      for (let i = 1; i < absDr; i++) {
        if (board[fr + i * unitR][fc + i * unitC] !== 0) {
          midR = fr + i * unitR;
          midC = fc + i * unitC;
          break;
        }
      }

      if (midR !== -1) {
        const jumpedPiece = board[midR][midC];
        const isOpponenPiece = (playerNum === 1 && (jumpedPiece === P2_NORMAL || jumpedPiece === P2_KING)) ||
                               (playerNum === 2 && (jumpedPiece === P1_NORMAL || jumpedPiece === P1_KING));
        if (isOpponenPiece) {
          const idx = game.pending_captures.findIndex(([pr, pc]) => pr === midR && pc === midC);
          if (idx !== -1) game.pending_captures.splice(idx, 1);
          else game.pending_captures.push([midR, midC]);
        }
      }
    }

    game.board = board;
    await game.save();

    await this.roomModel.updateOne(
      { _id: new Types.ObjectId(room_id), 'players.playerId': new Types.ObjectId(client.data.player_id) },
      { $push: { 'players.$.moves': { data: { from, to, type: 'move' } } } }
    );

    const room = await this.roomModel.findById(room_id);
    const p1Id = room.players[0]?.playerId?.toString();
    const p2Id = room.players[1]?.playerId?.toString();
    const player1 = p1Id ? await this.getCachedUsername(p1Id) : 'Unknown';
    const player2 = p2Id ? await this.getCachedUsername(p2Id) : 'Unknown';
    const shotFrom = await this.getCachedUsername(client.data.player_id);

    const now = new Date();
    const elapsed = Math.floor((now.getTime() - game.turn_start_time.getTime()) / 1000);
    const remaining = Math.max(0, 30 - elapsed);

    const sockets = await this.server.in(room_id).fetchSockets();
    const pendingCaptures = game.pending_captures || [];

    for (const s of sockets) {
      if (s.id === client.id) {
        if (chainPossible) {
          client.emit('halma', { success: true, data: { board, pendingCaptures, yourTurn: true, turnTimerSeconds: remaining, outcome: '', isPlayerOne: playerNum === 1, continuingJump: true, jumpingPiece: { row: tr, col: tc }, isSpectator: false }, messages: ['You can jump again!'] });
        } else {
          client.emit('halma', { success: true, data: { board, pendingCaptures, yourTurn: true, turnTimerSeconds: remaining, outcome: '', isPlayerOne: playerNum === 1, mustEndTurn: true, isSpectator: false }, messages: ['Move accepted. End turn when ready.'] });
        }
      } else {
        const sIsSpectator = (s as any).data.isSpectator || false;
        const sPlayerNum = (s as any).data.playerNum || 2;
        const sData: any = { board, pendingCaptures, yourTurn: false, turnTimerSeconds: remaining, outcome: '', isPlayerOne: sPlayerNum === 1, isSpectator: sIsSpectator };
        if (sIsSpectator) {
           sData.player1 = player1; sData.player2 = player2; sData.shotFrom = shotFrom;
           sData.turnOf = playerNum === 1 ? player1 : player2;
        }
        (s as unknown as Socket).emit('halma', { success: true, data: sData, messages: sIsSpectator ? [chainPossible ? 'Continuing jump.' : 'A move was made.'] : [chainPossible ? 'Opponent is continuing jump.' : 'Opponent moved.'] });
      }
    }
  }

  @SubscribeMessage('end_turn')
  async handleEndTurn(@ConnectedSocket() client: Socket, @MessageBody() payload: { room_id: string }) {
    if (client.data.isSpectator) return client.emit('halma', { success: false, messages: ['Spectators cannot perform actions.'] });
    const { room_id } = payload;
    const playerNum = client.data.playerNum || 1;
    if (!room_id) return;
    const game = await this.halmaModel.findOne({ room_id: new Types.ObjectId(room_id) });
    if (!game || game.current_player !== playerNum) return;
    
    // 1. Finalize Captures
    if (game.pending_captures && game.pending_captures.length > 0) {
      const board = game.board as number[][];
      for (const [cr, cc] of game.pending_captures) { board[cr][cc] = 0; }
      game.board = board;
      game.pending_captures = [];
    }

    game.current_player = (playerNum === 1 ? 2 : 1) as 1 | 2;
    game.turn_start_time = new Date();
    await game.save();

    await this.roomModel.updateOne(
      { _id: new Types.ObjectId(room_id), 'players.playerId': new Types.ObjectId(client.data.player_id) },
      { $push: { 'players.$.moves': { data: { type: 'end_turn' } } } }
    );

    const timerSec = 30;
    const sockets = await this.server.in(room_id).fetchSockets();
    const opponent = sockets.find(s => (s as any).data.playerNum === game.current_player);
    const p1Id = game.player1_id?.toString();
    const p2Id = game.player2_id?.toString();
    const player1 = p1Id ? await this.getCachedUsername(p1Id) : 'Unknown';
    const player2 = p2Id ? await this.getCachedUsername(p2Id) : 'Unknown';
    const shotFrom = await this.getCachedUsername(client.data.player_id);

    clearTimer(client.id);
    if (opponent) this.startTimer(opponent as unknown as Socket, room_id, timerSec);

    // 2. Refresh Win Condition Check (Elimination Only)
    const board = game.board as number[][];
    const p1Pieces = board.flat().filter(p => p === 1 || p === 3).length;
    const p2Pieces = board.flat().filter(p => p === 2 || p === 4).length;

    let automatedWinner = 0;
    const winReason = 'elimination';
    if (p1Pieces === 0) automatedWinner = 2;
    else if (p2Pieces === 0) automatedWinner = 1;

    if (automatedWinner !== 0) {
        const room = await this.roomModel.findById(room_id);
        const winnerId = automatedWinner === 1 ? game.player1_id : game.player2_id;
        room.status = 'finished'; room.winner = winnerId; room.winner_reason = winReason; room.finished_at = new Date();
        await room.save();
        const prize = room.bet_amount + (room.bet_amount * (1 - room.house_edge / 100));
        await this.userModel.updateOne({ _id: winnerId }, { $inc: { balance: prize } });

        for (const s of sockets) {
          const sPNum = (s as any).data.playerNum || 2;
          const sIsSpectator = (s as any).data.isSpectator || false;
          const outcome = sPNum === automatedWinner ? 'win' : 'lose';
          (s as unknown as Socket).emit('halma', {
            success: true,
            data: {
              board: game.board, gameEnded: true, outcome, youWon: sPNum === automatedWinner && !sIsSpectator,
              winner: winnerId, reason: winReason, prize: sPNum === automatedWinner ? prize : 0, isSpectator: sIsSpectator
            },
            messages: sIsSpectator ? ['Game over!'] : [outcome === 'win' ? 'You win!' : 'All your pieces were captured. You lose.']
          });
        }
        const gameId = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
        if (gameId) this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
        return;
    }

    for (const s of sockets) {
      const pNum = (s as any).data.playerNum || 2;
      const sIsSpectator = (s as any).data.isSpectator || false;
      const isMyTurn = sIsSpectator ? false : pNum === game.current_player;
      const msg = sIsSpectator ? ['Turn ended.'] : [(isMyTurn ? 'Your turn!' : 'Opponent ended turn.')];
      const sData: any = { board: game.board, yourTurn: isMyTurn, turnTimerSeconds: timerSec, outcome: '', isPlayerOne: pNum === 1, isSpectator: sIsSpectator };
      if (sIsSpectator) { sData.player1 = player1; sData.player2 = player2; sData.shotFrom = shotFrom; sData.turnOf = game.current_player === 1 ? player1 : player2; }
      (s as unknown as Socket).emit('halma', { success: true, data: sData, messages: msg });
    }
  }

  private startTimer(socket: Socket, room_id: string, seconds: number) {
    clearTimer(socket.id);
    const t = setTimeout(async () => {
      const game = await this.halmaModel.findOne({ room_id: new Types.ObjectId(room_id) });
      if (!game) return;
      const winnerNum = game.current_player === 1 ? 2 : 1;
      const winnerId = winnerNum === 1 ? game.player1_id : game.player2_id;
      const room = await this.roomModel.findById(room_id);
      if (room && room.status === 'started') {
        room.status = 'finished'; room.winner = winnerId; room.winner_reason = 'timeout'; room.finished_at = new Date();
        await room.save();
        const prize = room.bet_amount * (2 - room.house_edge / 100);
        await this.userModel.updateOne({ _id: winnerId }, { $inc: { balance: prize } });
        
        const sockets = await this.server.in(room_id).fetchSockets();
        for (const s of sockets) {
          const socketPlayerId = (s as any).data.player_id;
          const isWinner = socketPlayerId === winnerId.toString();
          const sIsSpectator = (s as any).data.isSpectator || false;
          const winnerUsername = await this.getCachedUsername(winnerId.toString());
          (s as unknown as Socket).emit('halma', {
            success: true,
            data: {
              gameEnded: true,
              outcome: isWinner ? 'win' : 'timeout_loss',
              youWon: isWinner && !sIsSpectator,
              winner: sIsSpectator ? winnerUsername : winnerId,
              reason: 'timeout',
              prize: isWinner ? prize : 0,
              isPlayerOne: (s as any).data.playerNum === 1,
              isSpectator: sIsSpectator,
            },
            messages: sIsSpectator ? ['A player timed out. Game over.'] : [isWinner ? 'Opponent timed out. You win!' : 'Turn time expired. You lose.']
          });
        }
        
        const gameId = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
        if (gameId) this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
      }
    }, seconds * 1000);
    turnTimers.set(socket.id, t);
  }
}
