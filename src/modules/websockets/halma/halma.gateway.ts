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
import { createHalmaBoard, isValidStep, isValidJump, canJumpFurther, checkHalmaWin, HalmaBoard } from './halma-game.logic';

const turnTimers = new Map<string, ReturnType<typeof setTimeout>>();
const clearTimer = (id: string) => { const t = turnTimers.get(id); if (t) { clearTimeout(t); turnTimers.delete(id); } };

@WebSocketGateway({ namespace: '/halma', cors: { origin: '*', credentials: true } })
export class HalmaGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(HalmaGateway.name);

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

    const room = await this.roomModel.findOne({ _id: roomObjId, 'players.playerId': playerObjId });
    if (!room || room.status === 'finished') return;

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
      client.to(room_id).emit('halma', { success: false, data: { outcome: 'opponent_disconnected', gameEnded: true }, messages: ['Opponent disconnected. You win!'] });

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
    if (!isMember) return client.emit('halma', { success: false, messages: ['Not in room.'] });

    await client.join(room_id);
    const playerIndex = room.players.findIndex((p: any) => p.playerId.toString() === player_id);
    const playerNum = playerIndex + 1;
    client.data.playerNum = playerNum;
    client.data.room_id = room_id;

    if (room.status === 'started') {
      const game = await this.halmaModel.findOne({ room_id });
      if (game) {
        const isMyTurn = game.current_player === playerNum;
        const timerSeconds = 30;
        return client.emit('halma', { success: true, messages: [], data: {
        board: game ? game.board : createHalmaBoard(),
        yourTurn: isMyTurn, turnTimerSeconds: timerSeconds,
        waitingForOpponent: false, isPlayerOne: playerNum === 1, gameStarted: true, youWon: false
      }});
      }
    }

    client.emit('halma', { success: true, data: { waitingForOpponent: true, isPlayerOne: playerNum === 1 }, messages: ['Waiting for opponent.'] });

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
        (s as unknown as Socket).emit('halma', { success: true, data: { board, yourTurn: isTurn, isPlayerOne: pNum === 1, gameStarted: true, turnTimerSeconds: 30 }, messages: [isTurn ? 'Your turn!' : 'Waiting for opponent.'] });
        if (isTurn) this.startTimer(s as unknown as Socket, room_id, 30);
      }
    }
  }

  @SubscribeMessage('move')
  async handleMove(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
    const { room_id, isChainJump } = payload;
    let from = payload.from;
    let to = payload.to;

    // Support legacy payload format
    if (!from && payload.from_row !== undefined && payload.from_col !== undefined) {
      from = [Number(payload.from_row), Number(payload.from_col)];
    }
    if (!to && payload.to_row !== undefined && payload.to_col !== undefined) {
      to = [Number(payload.to_row), Number(payload.to_col)];
    }

    this.logger.debug(`[Halma] handleMove payload: ${JSON.stringify(payload)}`);
    this.logger.debug(`[Halma] Processed from: ${JSON.stringify(from)}, to: ${JSON.stringify(to)}`);

    const playerNum = client.data.playerNum;

    if (!room_id || !from || !to || !Array.isArray(from) || !Array.isArray(to) || from.length !== 2 || to.length !== 2) {
      this.logger.error(`[Halma] Validation failed: room_id=${!!room_id}, from=${JSON.stringify(from)}, to=${JSON.stringify(to)}`);
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

    board[tr][tc] = board[fr][fc];
    board[fr][fc] = 0;
    game.board = board;

    await this.roomModel.updateOne(
      { _id: new Types.ObjectId(room_id), 'players.playerId': new Types.ObjectId(client.data.player_id) },
      { $push: { 'players.$.moves': { data: { from, to, type: 'move' } } } }
    );

    const won = checkHalmaWin(board, playerNum);
    if (won) {
      const room = await this.roomModel.findById(room_id);
      const winner_id = playerNum === 1 ? game.player1_id : game.player2_id;
      room.status = 'finished'; room.winner = winner_id; room.winner_reason = 'normal'; room.finished_at = new Date();
      await room.save();
      const prize = room.bet_amount + (room.bet_amount * (1 - room.house_edge / 100));
      await this.userModel.updateOne({ _id: winner_id }, { $inc: { balance: prize } });
      await game.save();

      const sockets = await this.server.in(room_id).fetchSockets();
      for (const s of sockets) {
        const pNum = (s as any).data.playerNum;
        s.emit('halma', { 
          success: true, 
          data: { 
            board, 
            gameEnded: true, 
            outcome: pNum === playerNum ? 'win' : 'lose',
            youWon: pNum === playerNum,
            winner: winner_id, 
            reason: 'normal',
            prize: pNum === playerNum ? prize : 0, 
            isPlayerOne: pNum === 1, 
            yourTurn: false 
          }, 
          messages: [pNum === playerNum ? 'You win!' : 'You lose!'] 
        });
      }

      const gameId = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
      if (gameId) this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
      return;
    }

    const chainPossible = isJump && canJumpFurther(board, tr, tc);
    if (!chainPossible) {
      // The player completed their required moves but turn does not auto-swap!
      // They MUST end their turn manually in Halma.
    }
    game.turn_start_time = new Date();
    await game.save();
    if (!chainPossible) clearTimer(client.id);

    if (chainPossible) {
      client.emit('halma', { success: true, data: { board, yourTurn: true, turnTimerSeconds: 30, outcome: '', isPlayerOne: playerNum === 1, continuingJump: true, jumpingPiece: { row: tr, col: tc } }, messages: ['You can jump again!'] });
      client.to(room_id).emit('halma', { success: true, data: { board, yourTurn: false, turnTimerSeconds: 30, outcome: '', isPlayerOne: playerNum !== 1 }, messages: ['Opponent is continuing jump.'] });
    } else {
      client.emit('halma', { success: true, data: { board, yourTurn: true, turnTimerSeconds: 30, outcome: '', isPlayerOne: playerNum === 1, mustEndTurn: true }, messages: ['Move accepted. End turn when ready.'] });
      client.to(room_id).emit('halma', { success: true, data: { board, yourTurn: false, turnTimerSeconds: 30, outcome: '', isPlayerOne: playerNum !== 1 }, messages: ['Opponent moved.'] });
    }
  }

  @SubscribeMessage('end_turn')
  async handleEndTurn(@ConnectedSocket() client: Socket, @MessageBody() payload: { room_id: string }) {
    const { room_id } = payload;
    const playerNum = client.data.playerNum;
    if (!room_id) return;
    const game = await this.halmaModel.findOne({ room_id: new Types.ObjectId(room_id) });
    if (!game || game.current_player !== playerNum) return;
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
    clearTimer(client.id);
    if (opponent) this.startTimer(opponent as unknown as Socket, room_id, timerSec);

    for (const s of sockets) {
      const pNum = (s as any).data.playerNum;
      (s as unknown as Socket).emit('halma', { success: true, data: { board: game.board, yourTurn: pNum === game.current_player, turnTimerSeconds: timerSec, outcome: '', isPlayerOne: pNum === 1 }, messages: [pNum === game.current_player ? 'Your turn!' : 'Opponent ended turn.'] });
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
          (s as unknown as Socket).emit('halma', {
            success: true,
            data: {
              gameEnded: true,
              outcome: isWinner ? 'win' : 'timeout_loss',
              youWon: isWinner,
              winner: winnerId,
              reason: 'timeout',
              prize: isWinner ? prize : 0,
              isPlayerOne: (s as any).data.playerNum === 1,
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
