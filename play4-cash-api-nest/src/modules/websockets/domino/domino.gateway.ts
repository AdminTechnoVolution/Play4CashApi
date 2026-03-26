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
import { DominoGame, DominoGameDocument } from './schemas/domino-game.schema';
import { deal, getStartingPlayerIndex, hasValidMoves, validateMove, getDominoGameResult } from './domino-game.logic';

const turnTimers = new Map<string, ReturnType<typeof setTimeout>>();
const clearTimer = (id: string) => { const t = turnTimers.get(id); if (t) { clearTimeout(t); turnTimers.delete(id); } };

@WebSocketGateway({ namespace: '/domino', cors: { origin: '*', credentials: true } })
export class DominoGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(DominoGateway.name);

  constructor(
    @InjectModel(DominoGame.name) private readonly dominoModel: Model<DominoGameDocument>,
    @InjectModel('Room') private readonly roomModel: Model<any>,
    @InjectModel('User') private readonly userModel: Model<any>,
    private readonly config: ConfigService,
    private readonly roomsGateway: RoomsGateway,
    @Inject(REDIS_CLIENT) private readonly redis: any,
  ) {}

  afterInit(server: Server) { applyWsAuth(server, this.config.get<string>('jwt.secret')!, this.redis); }

  handleConnection(client: Socket) { this.logger.log(`[Domino] Connected: ${client.id}`); }

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
      else this.server.to(room_id).emit('domino', { success: true, data: { opponentLeft: true, waitingForOpponent: true }, messages: ['Opponent left.'] });
      return;
    }
    if (room.status === 'started') {
      const winner_id = room.players.find((p: any) => p.playerId.toString() !== player_id.toString())?.playerId;
      if (!winner_id) return;
      room.status = 'finished'; room.winner = winner_id; room.winner_reason = 'forfeit'; room.finished_at = new Date();
      await room.save();
      const prize = room.bet_amount * (2 - room.house_edge / 100);
      await this.userModel.findByIdAndUpdate(winner_id, { $inc: { balance: prize } });
      this.server.to(room_id).emit('domino', { success: false, data: { outcome: 'opponent_disconnected', gameEnded: true }, messages: ['Opponent disconnected. You win!'] });
      
      const gameId = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
      if (gameId) this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
    }
  }

  @SubscribeMessage('join')
  async handleJoin(@ConnectedSocket() client: Socket, @MessageBody() payload: { room_id: string }) {
    if (!payload?.room_id) return client.emit('domino', { success: false, messages: ['Missing room_id'] });
    const { room_id } = payload;
    const player_id = client.data.player_id;

    const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds max_players');
    if (!room) return client.emit('domino', { success: false, messages: ['Room not found.'] });

    const isMember = room.players.some((p: any) => p.playerId.toString() === player_id);
    if (!isMember) return client.emit('domino', { success: false, messages: ['Not in room.'] });

    await client.join(room_id);
    const playerIndex = room.players.findIndex((p: any) => p.playerId.toString() === player_id);
    client.data.playerNum = playerIndex + 1;
    client.data.room_id = room_id;

    if (room.status === 'started') {
      const game = await this.dominoModel.findOne({ room_id });
      if (game) {
        const myHand = game.hands.get(player_id) || [];
        const isMyTurn = game.player_ids[game.current_player_index]?.toString() === player_id;
        return client.emit('domino', { success: true, messages: [], data: {
        board: game.board, hand: game.hands.get(player_id) || [],
        yourTurn: isMyTurn, turnTimerSeconds: 30,
        waitingForOpponent: false, gameStarted: true, youWon: false
      }});
      }
    }

    client.emit('domino', { success: true, data: { waitingForOpponent: true, isPlayerOne: playerIndex === 0 }, messages: ['Waiting for opponent.'] });

    const socketsInRoom = await this.server.in(room_id).fetchSockets();
    if (socketsInRoom.length > 1) {
      const user = await this.userModel.findById(player_id).select('username');
      const username = user?.username || 'Opponent';
      client.to(room_id).emit('domino', { success: true, data: { opponentJoined: true, opponentName: username }, messages: [`${username} joined!`] });
    }

    const maxPlayers = room.player_limit || room.game_id?.max_players || 2;

    if (socketsInRoom.length >= maxPlayers && room.status === 'waiting') {
      const started = await this.roomModel.findOneAndUpdate({ _id: room_id, status: 'waiting' }, { $set: { status: 'started' } }, { returnDocument: 'after' });
      if (!started) return;

      const playerIds = room.players.map((p: any) => p.playerId);
      // Deduct bets atomically
      let allPaid = true;
      const paid: Types.ObjectId[] = [];
      for (const pid of playerIds) {
        const deducted = await this.userModel.findOneAndUpdate({ _id: pid, balance: { $gte: room.bet_amount } }, { $inc: { balance: -room.bet_amount } });
        if (!deducted) { allPaid = false; break; }
        paid.push(pid);
      }
      if (!allPaid) {
        for (const pid of paid) await this.userModel.updateOne({ _id: pid }, { $inc: { balance: room.bet_amount } });
        await this.roomModel.findByIdAndUpdate(room_id, { $set: { status: 'waiting' } });
        this.server.to(room_id).emit('domino', { success: false, messages: ['Insufficient balance.'] });
        return;
      }

      const { hands, boneyard } = deal(playerIds.map((p: any) => p.toString()));
      const startIdx = getStartingPlayerIndex(playerIds.map((p: any) => p.toString()), hands);

      const handsRecord: Record<string, any> = {};
      hands.forEach((v, k) => { handsRecord[k] = v; });
      await this.dominoModel.create({ room_id, player_ids: playerIds, hands: handsRecord, boneyard, current_player_index: startIdx, turn_start_time: new Date() });

      const timerSec = room.game_id?.turn_timer_seconds ?? 30;
      for (const s of socketsInRoom) {
        const pid = (s as any).data.player_id;
        const myHand = hands.get(pid) || [];
        const isMyTurn = playerIds[startIdx].toString() === pid;
        (s as unknown as Socket).emit('domino', { success: true, data: { hand: myHand, board: [], boneyardCount: boneyard.length, yourTurn: isMyTurn, turnTimerSeconds: timerSec, gameStarted: true }, messages: [isMyTurn ? 'Game started! Your turn.' : 'Game started!'] });
        if (isMyTurn) this.startTimer(s as unknown as Socket, room_id, timerSec);
      }
    }
  }

  @SubscribeMessage('move')
  async handleMove(@ConnectedSocket() client: Socket, @MessageBody() payload: { room_id: string; tile: number[]; side: 'left' | 'right' }) {
    const { room_id, tile, side } = payload;
    const player_id = client.data.player_id;
    if (!room_id || !tile || !side) return client.emit('domino', { success: false, messages: ['Invalid payload'] });

    const game = await this.dominoModel.findOne({ room_id: new Types.ObjectId(room_id) });
    if (!game) return client.emit('domino', { success: false, messages: ['Game not found'] });
    if (game.player_ids[game.current_player_index]?.toString() !== player_id) return client.emit('domino', { success: false, messages: ['Not your turn.'] });

    const { valid, flippedTile } = validateMove(tile as [number, number], side, game.open_ends || {});
    if (!valid) return client.emit('domino', { success: false, messages: ['Invalid move.'] });

    const hand = game.hands.get(player_id) || [];
    const tileIdx = hand.findIndex(([v1, v2]) => (v1 === tile[0] && v2 === tile[1]) || (v1 === tile[1] && v2 === tile[0]));
    if (tileIdx === -1) return client.emit('domino', { success: false, messages: ['Tile not in hand.'] });
    hand.splice(tileIdx, 1);
    game.hands.set(player_id, hand);

    await this.roomModel.updateOne(
      { _id: new Types.ObjectId(room_id), 'players.playerId': new Types.ObjectId(player_id) },
      { $push: { 'players.$.moves': { data: { tile, side, type: 'move' } } } }
    );

    if (side === 'left') {
      game.board.unshift(flippedTile);
      game.open_ends = game.open_ends || {};
      game.open_ends.left = flippedTile[0];
      if (game.board.length === 1) game.open_ends.right = flippedTile[1];
    } else {
      game.board.push(flippedTile);
      game.open_ends = game.open_ends || {};
      game.open_ends.right = flippedTile[1];
      if (game.board.length === 1) game.open_ends.left = flippedTile[0];
    }

    game.consecutive_passes = 0;
    game.current_player_index = (game.current_player_index + 1) % game.player_ids.length;
    game.turn_start_time = new Date();

    const handsObj = Object.fromEntries(game.hands);
    const result = getDominoGameResult(new Map(Object.entries(handsObj)) as Map<string, any>, game.consecutive_passes, game.player_ids.map((p: any) => p.toString()));

    if (result.finished) {
      const room = await this.roomModel.findById(room_id);
      room.status = 'finished'; room.winner_reason = result.reason; room.finished_at = new Date();
      if (result.winner) {
        room.winner = new Types.ObjectId(result.winner);
        const prize = (room.bet_amount * room.players.length) * (1 - room.house_edge / 100);
        await this.userModel.updateOne({ _id: result.winner }, { $inc: { balance: prize } });
      }
      await room.save();
      
      const gameId = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
      if (gameId) this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
    }
    await game.save();

    const handCount = Object.fromEntries(Array.from(game.hands.entries()).map(([id, h]) => [id, h.length]));
    const sockets = await this.server.in(room_id).fetchSockets();
    const timerSec = 30;
    const nextPlayerId = game.player_ids[game.current_player_index].toString();
    const nextPlayerSocket = sockets.find(s => (s as any).data.player_id === nextPlayerId);
    clearTimer(client.id);
    if (!result.finished && nextPlayerSocket) this.startTimer(nextPlayerSocket as unknown as Socket, room_id, timerSec);

    for (const s of sockets) {
      const pid = (s as any).data.player_id;
      const myHand = game.hands.get(pid) || [];
      const isMyTurn = pid === nextPlayerId;
      (s as unknown as Socket).emit('domino', { success: true, data: { board: game.board, hand: myHand, boneyardCount: game.boneyard.length, lastTile: flippedTile, lastSide: side, lastPlayer: player_id, yourTurn: isMyTurn, turnTimerSeconds: timerSec, gameEnded: result.finished, winner: result.winner, reason: result.reason, handCount }, messages: [result.finished ? 'Game over!' : isMyTurn ? 'Your turn!' : 'Opponent moved.'] });
    }
  }

  @SubscribeMessage('draw')
  async handleDraw(@ConnectedSocket() client: Socket, @MessageBody() payload: { room_id: string }) {
    const { room_id } = payload;
    const player_id = client.data.player_id;
    if (!room_id) return;
    const game = await this.dominoModel.findOne({ room_id: new Types.ObjectId(room_id) });
    if (!game) return client.emit('domino', { success: false, messages: ['Game not found'] });
    if (game.player_ids[game.current_player_index]?.toString() !== player_id) return client.emit('domino', { success: false, messages: ['Not your turn.'] });
    if (game.boneyard.length === 0) return client.emit('domino', { success: false, messages: ['Boneyard empty.'] });

    const drawn = game.boneyard.splice(0, 1)[0];
    const hand = game.hands.get(player_id) || [];
    hand.push(drawn);
    game.hands.set(player_id, hand);
    await game.save();

    const handCount = Object.fromEntries(Array.from(game.hands.entries()).map(([id, h]) => [id, h.length]));
    const sockets = await this.server.in(room_id).fetchSockets();
    const timerSec = 30;
    const drawingPlayerSocket = sockets.find(s => (s as any).data.player_id === player_id);
    clearTimer(client.id);
    if (drawingPlayerSocket) this.startTimer(drawingPlayerSocket as unknown as Socket, room_id, timerSec);

    for (const s of sockets) {
      const pid = (s as any).data.player_id;
      const myHand = game.hands.get(pid) || [];
      const isDrawingPlayer = pid === player_id;
      
      (s as unknown as Socket).emit('domino', { success: true, data: { board: game.board, hand: myHand, boneyardCount: game.boneyard.length, lastTile: null, lastSide: null, lastPlayer: player_id, yourTurn: isDrawingPlayer, turnTimerSeconds: timerSec, handCount }, messages: [isDrawingPlayer ? 'You drew a tile.' : 'Opponent drew a tile.'] });
    }
  }

  @SubscribeMessage('pass')
  async handlePass(@ConnectedSocket() client: Socket, @MessageBody() payload: { room_id: string }) {
    const { room_id } = payload;
    const player_id = client.data.player_id;
    if (!room_id) return;
    const game = await this.dominoModel.findOne({ room_id: new Types.ObjectId(room_id) });
    if (!game) return client.emit('domino', { success: false, messages: ['Game not found'] });
    if (game.player_ids[game.current_player_index]?.toString() !== player_id) return client.emit('domino', { success: false, messages: ['Not your turn.'] });

    game.consecutive_passes++;
    game.current_player_index = (game.current_player_index + 1) % game.player_ids.length;
    game.turn_start_time = new Date();

    const handsObj = Object.fromEntries(game.hands);
    const result = getDominoGameResult(new Map(Object.entries(handsObj)) as Map<string, any>, game.consecutive_passes, game.player_ids.map((p: any) => p.toString()));

    if (result.finished) {
      const room = await this.roomModel.findById(room_id);
      room.status = 'finished'; room.winner_reason = result.reason; room.finished_at = new Date();
      if (result.winner) { room.winner = new Types.ObjectId(result.winner); const prize = room.bet_amount * (2 - room.house_edge / 100); await this.userModel.updateOne({ _id: result.winner }, { $inc: { balance: prize } }); }
      await room.save();
      
      const gameId = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
      if (gameId) this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
    }
    await game.save();
    const handCount = Object.fromEntries(Array.from(game.hands.entries()).map(([id, h]) => [id, h.length]));
    const sockets = await this.server.in(room_id).fetchSockets();
    const nextPlayerId = game.player_ids[game.current_player_index].toString();
    const nextPlayerSocket = sockets.find(s => (s as any).data.player_id === nextPlayerId);
    const timerSec = 30;
    clearTimer(client.id);
    if (!result.finished && nextPlayerSocket) this.startTimer(nextPlayerSocket as unknown as Socket, room_id, timerSec);

    for (const s of sockets) {
      const pid = (s as any).data.player_id;
      const myHand = game.hands.get(pid) || [];
      const isMyTurn = pid === nextPlayerId;
      (s as unknown as Socket).emit('domino', { success: true, data: { board: game.board, hand: myHand, boneyardCount: game.boneyard.length, lastTile: null, lastSide: null, lastPlayer: player_id, passed: true, gameEnded: result.finished, winner: result.winner, reason: result.reason, yourTurn: isMyTurn, turnTimerSeconds: timerSec, handCount }, messages: [result.finished ? 'Game over!' : isMyTurn ? 'Opponent passed, your turn!' : 'Opponent passed.'] });
    }
  }

  private startTimer(socket: Socket, room_id: string, seconds: number) {
    clearTimer(socket.id);
    const t = setTimeout(async () => {
      const game = await this.dominoModel.findOne({ room_id: new Types.ObjectId(room_id) });
      if (!game) return;
      
      const currentIdx = game.current_player_index;
      const winnerIdx = (currentIdx + 1) % game.player_ids.length;
      const winnerId = game.player_ids[winnerIdx];
      const room = await this.roomModel.findById(room_id);
      
      if (room && room.status === 'started') {
        room.status = 'finished'; room.winner = winnerId; room.winner_reason = 'timeout'; room.finished_at = new Date();
        await room.save();
        const prize = (room.bet_amount * room.players.length) * (1 - room.house_edge / 100);
        await this.userModel.updateOne({ _id: winnerId }, { $inc: { balance: prize } });
        
        const sockets = await this.server.in(room_id).fetchSockets();
        for (const s of sockets) {
          const socketPlayerId = (s as any).data.player_id;
          const isWinner = socketPlayerId === winnerId.toString();
          (s as unknown as Socket).emit('domino', {
            success: true,
            data: {
              gameEnded: true,
              winner: winnerId,
              reason: 'timeout',
              prize: isWinner ? prize : 0,
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
