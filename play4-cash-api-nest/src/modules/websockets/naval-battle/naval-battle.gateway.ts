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
import { BattleshipPlacement, BattleshipPlacementDocument } from '../../naval-battle/schemas/battleship-placement.schema';
import { RoomsGateway } from '../rooms/rooms.gateway';

const turnTimers = new Map<string, ReturnType<typeof setTimeout>>();
const clearTimer = (id: string) => { const t = turnTimers.get(id); if (t) { clearTimeout(t); turnTimers.delete(id); } };

@WebSocketGateway({ namespace: '/naval-battle', cors: { origin: '*', credentials: true } })
export class NavalBattleGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(NavalBattleGateway.name);

  constructor(
    @InjectModel(BattleshipPlacement.name) private readonly placementModel: Model<BattleshipPlacementDocument>,
    @InjectModel('Room') private readonly roomModel: Model<any>,
    @InjectModel('User') private readonly userModel: Model<any>,
    private readonly config: ConfigService,
    private readonly roomsGateway: RoomsGateway,
    @Inject(REDIS_CLIENT) private readonly redis: any,
  ) {}

  afterInit(server: Server) { applyWsAuth(server, this.config.get<string>('jwt.secret')!, this.redis); }

  handleConnection(client: Socket) { this.logger.log(`[NavalBattle] Connected: ${client.id}`); }

  async handleDisconnect(client: Socket) {
    clearTimer(client.id);
    const { room_id, player_id } = client.data;
    if (!room_id || !player_id) return;
    const room = await this.roomModel.findOne({ _id: new Types.ObjectId(room_id), 'players.playerId': new Types.ObjectId(player_id) });
    if (!room || room.status === 'finished') return;
    if (room.status === 'waiting') {
      const updated = await this.roomModel.findOneAndUpdate({ _id: new Types.ObjectId(room_id), 'players.playerId': new Types.ObjectId(player_id) }, { $pull: { players: { playerId: new Types.ObjectId(player_id) } } }, { returnDocument: 'after' });
      // Refund if player placed ships
      const placement = await this.placementModel.findOne({ room_id, player_id });
      if (placement) { await this.userModel.updateOne({ _id: player_id }, { $inc: { balance: room.bet_amount } }); await this.placementModel.findByIdAndDelete(placement._id); }
      if (updated?.players.length === 0) await this.roomModel.findOneAndDelete({ _id: room_id, players: { $size: 0 } });
      else this.server.to(room_id).emit('naval-battle', { success: true, data: { opponentLeft: true, waitingForOpponent: true }, messages: ['Opponent left.'] });
      return;
    }
    if (room.status === 'started') {
      const winner_id = room.players.find((p: any) => p.playerId.toString() !== player_id)?.playerId;
      if (!winner_id) return;
      room.status = 'finished'; room.winner = winner_id; room.winner_reason = 'forfeit'; room.finished_at = new Date();
      await room.save();
      const prize = room.bet_amount * (2 - room.house_edge / 100);
      await this.userModel.findByIdAndUpdate(winner_id, { $inc: { balance: prize } });
      this.server.to(room_id).emit('naval-battle', { success: false, data: { outcome: 'opponent_disconnected', gameEnded: true }, messages: ['Opponent disconnected. You win!'] });
      const gameId = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
      if (gameId) this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
    }
  }

  @SubscribeMessage('join')
  async handleJoin(@ConnectedSocket() client: Socket, @MessageBody() payload: { room_id: string }) {
    if (!payload?.room_id) return client.emit('naval-battle', { success: false, messages: ['Missing room_id'] });
    const { room_id } = payload;
    const player_id = client.data.player_id;

    const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds');
    if (!room) return client.emit('naval-battle', { success: false, messages: ['Room not found.'] });

    const isMember = room.players.some((p: any) => p.playerId.toString() === player_id);
    if (!isMember) return client.emit('naval-battle', { success: false, messages: ['Not in room.'] });

    await client.join(room_id);
    client.data.room_id = room_id;

    const socketsInRoom = await this.server.in(room_id).fetchSockets();
    if (socketsInRoom.length > 1) {
      const user = await this.userModel.findById(player_id).select('username');
      const username = user?.username || 'Opponent';
      client.to(room_id).emit('naval-battle', { success: true, data: { opponentJoined: true, opponentName: username }, messages: [`${username} joined!`] });
    }

    const myPlacement = await this.placementModel.findOne({ room_id, player_id });
    if (myPlacement) {
      const isMyTurn = client.data.myTurn;
      return client.emit('naval-battle', { success: true, data: {
        ships: myPlacement.ships, shotsFired: myPlacement.shotsFired, status: myPlacement.status,
        waitingForOpponent: room.status === 'waiting', gameStarted: room.status === 'started',
        yourTurn: isMyTurn, turnTimerSeconds: 30
      }, messages: ['Reconnected.'] });
    }

    client.emit('naval-battle', { success: true, data: { waitingForOpponent: true }, messages: ['Joined. Place your ships.'] });
  }

  @SubscribeMessage('place_ships')
  async handlePlaceShips(@ConnectedSocket() client: Socket, @MessageBody() payload: { room_id: string; ships: any[] }) {
    const { room_id, ships } = payload;
    const player_id = client.data.player_id;
    if (!room_id || !ships?.length) return client.emit('naval-battle', { success: false, messages: ['Invalid payload'] });

    const room = await this.roomModel.findById(room_id);
    if (!room) return client.emit('naval-battle', { success: false, messages: ['Room not found.'] });

    const existing = await this.placementModel.findOne({ room_id, player_id });
    if (existing) return client.emit('naval-battle', { success: false, messages: ['Ships already placed.'] });

    // Deduct bet when ships are placed (per original ship placement balance logic)
    const deducted = await this.userModel.findOneAndUpdate({ _id: player_id, balance: { $gte: room.bet_amount } }, { $inc: { balance: -room.bet_amount } });
    if (!deducted) return client.emit('naval-battle', { success: false, messages: ['Insufficient balance.'] });

    await this.placementModel.create({ room_id, player_id, ships, status: 'placed' });

    client.emit('naval-battle', { success: true, data: { shipsPlaced: true }, messages: ['Ships placed! Waiting for opponent.'] });

    // Check if both players have placed
    const allPlacements = await this.placementModel.find({ room_id });
    if (allPlacements.length === 2) {
      await this.roomModel.findByIdAndUpdate(room_id, { status: 'started' });
      await this.placementModel.updateMany({ room_id }, { status: 'ready' });
      this.server.to(room_id).emit('naval-battle', { success: true, data: { gameStarted: true, yourTurn: false, turnTimerSeconds: 30 }, messages: ['Both players ready! Game starts.'] });
      // Player 1 goes first
      const p1Sockets = await this.server.in(room_id).fetchSockets();
      const p1Player = room.players[0].playerId.toString();
      const timerSeconds = room.game_id?.turn_timer_seconds ?? 30;
      for (const s of p1Sockets) {
        const pid = (s as any).data.player_id;
        const isTurn = pid === p1Player;
        (s as unknown as Socket).emit('naval-battle', { success: true, data: { yourTurn: isTurn, turnTimerSeconds: timerSeconds }, messages: [isTurn ? 'Your turn to fire!' : 'Both players ready! Game starts.'] });
        if (isTurn) this.startTimer(s as unknown as Socket, room_id, timerSeconds);
      }
    }
  }

  @SubscribeMessage('fire')
  async handleFire(@ConnectedSocket() client: Socket, @MessageBody() payload: { room_id: string; row: number; col: number }) {
    const { room_id, row, col } = payload;
    const player_id = client.data.player_id;
    if (!room_id || row === undefined || col === undefined) return client.emit('naval-battle', { success: false, messages: ['Invalid payload'] });

    const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds');
    if (!room || room.status !== 'started') return client.emit('naval-battle', { success: false, messages: ['Game not active.'] });

    const timerSeconds = (room.game_id as any)?.turn_timer_seconds ?? 30;

    // Get both placements safely cast to ObjectIds
    const roomObjId = new Types.ObjectId(room_id);
    const myPlacement = await this.placementModel.findOne({ room_id: roomObjId, player_id: new Types.ObjectId(player_id) });
    const opponent = room.players.find((p: any) => p.playerId.toString() !== player_id);
    const opponentPlacement = await this.placementModel.findOne({ room_id: roomObjId, player_id: new Types.ObjectId(opponent?.playerId.toString()) });

    if (!myPlacement || !opponentPlacement) return client.emit('naval-battle', { success: false, messages: ['Game data not found.'] });

    // Check if already fired here
    const alreadyFired = myPlacement.shotsFired.some(s => s[0] === row && s[1] === col);
    if (alreadyFired) return client.emit('naval-battle', { success: false, messages: ['Already fired here.'] });

    // Check for hit
    let hit = false, sunkShipType: string | null = null;
    for (const ship of opponentPlacement.ships) {
      if (ship.cells.some(cell => cell[0] === row && cell[1] === col)) {
        hit = true;
        // Check if entire ship is sunk
        const allHit = ship.cells.every(cell => myPlacement.shotsFired.some(s => s[0] === cell[0] && s[1] === cell[1]) || (cell[0] === row && cell[1] === col));
        if (allHit) sunkShipType = ship.type;
        break;
      }
    }

    myPlacement.shotsFired.push([row, col]);
    await myPlacement.save();

    const moveIndex = room.players.find((p: any) => p.playerId.toString() === player_id)?.moves?.length ?? 0;
    await this.roomModel.updateOne(
      { _id: roomObjId, 'players.playerId': new Types.ObjectId(player_id) },
      { $push: { 'players.$.moves': { data: { row, col, outcome: 'pending' } } } }
    );

    // Check if all opponent ships sunk
    const allSunk = opponentPlacement.ships.every(ship =>
      ship.cells.every(cell => myPlacement.shotsFired.some(s => s[0] === cell[0] && s[1] === cell[1]))
    );

    let outcome = 'miss';
    if (allSunk) outcome = 'win';
    else if (sunkShipType) outcome = 'sunk';
    else if (hit) outcome = 'hit';

    // Update move history with outcome
    await this.roomModel.updateOne(
      { _id: roomObjId, 'players.playerId': new Types.ObjectId(player_id) },
      { $set: { [`players.${room.players.findIndex((p: any) => p.playerId.toString() === player_id)}.moves.${moveIndex}.data.outcome`]: outcome, [`players.${room.players.findIndex((p: any) => p.playerId.toString() === player_id)}.moves.${moveIndex}.data.shipType`]: sunkShipType } }
    );

    if (allSunk) {
      room.status = 'finished'; room.winner = new Types.ObjectId(player_id); room.winner_reason = 'normal'; room.finished_at = new Date();
      await room.save();
      const prize = room.bet_amount + (room.bet_amount * (1 - room.house_edge / 100)); // Win original bet + opponent minus house edge
      await this.userModel.updateOne({ _id: player_id }, { $inc: { balance: prize } });
      
      client.emit('naval-battle', { success: true, data: { outcome: 'win', row, col, shipType: sunkShipType, prize, yourTurn: false, gameEnded: true }, messages: ['You win!'] });
      
      const opponentSocketId = opponent?.playerId.toString();
      const sockets = await this.server.in(room_id).fetchSockets();
      for (const s of sockets) {
        if ((s as any).data.player_id === opponentSocketId) {
          (s as unknown as Socket).emit('naval-battle', { success: true, data: { outcome: 'lose', row, col, shipType: sunkShipType, yourTurn: false, gameEnded: true }, messages: ['You lose!'] });
        }
      }
      
      const gameId = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
      if (gameId) this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
      return;
    }

    const shooterMsg = outcome === 'miss' ? 'Miss!' : outcome === 'sunk' ? `You sank the ${sunkShipType}!` : `Hit on ${sunkShipType}!`;
    client.emit('naval-battle', { success: true, data: { outcome, row, col, shipType: sunkShipType, yourTurn: false, turnTimerSeconds: timerSeconds }, messages: [shooterMsg] });
    
    const oppMsg = outcome === 'miss' ? 'Opponent missed! Your turn.' : outcome === 'sunk' ? `Opponent sank your ${sunkShipType}! Your turn.` : `Opponent hit your ${sunkShipType}! Your turn.`;
    const opponentSocketId = opponent?.playerId.toString();
    const sockets = await this.server.in(room_id).fetchSockets();
    const opponentSocket = sockets.find(s => (s as any).data.player_id === opponentSocketId);
    clearTimer(client.id);
    if (!allSunk && opponentSocket) this.startTimer(opponentSocket as unknown as Socket, room_id, timerSeconds);

    for (const s of sockets) {
      if ((s as any).data.player_id === opponentSocketId) {
        (s as unknown as Socket).emit('naval-battle', { success: true, data: { outcome: outcome === 'miss' ? 'miss' : outcome, row, col, shipType: sunkShipType, yourTurn: !allSunk, turnTimerSeconds: timerSeconds }, messages: [oppMsg] });
      }
    }
  }

  private startTimer(socket: Socket, room_id: string, seconds: number) {
    clearTimer(socket.id);
    const t = setTimeout(async () => {
      const room = await this.roomModel.findById(room_id);
      if (!room || room.status !== 'started') return;
      
      const currentShooterId = socket.data.player_id;
      const opponent = room.players.find((p: any) => p.playerId.toString() !== currentShooterId);
      const winnerId = opponent?.playerId;
      
      if (winnerId) {
        room.status = 'finished'; room.winner = winnerId; room.winner_reason = 'timeout'; room.finished_at = new Date();
        await room.save();
        const prize = room.bet_amount * (2 - room.house_edge / 100);
        await this.userModel.updateOne({ _id: winnerId }, { $inc: { balance: prize } });
        
        const sockets = await this.server.in(room_id).fetchSockets();
        for (const s of sockets) {
          const socketPlayerId = (s as any).data.player_id;
          const isWinner = socketPlayerId === winnerId.toString();
          (s as unknown as Socket).emit('naval-battle', {
            success: true,
            data: {
              gameEnded: true,
              outcome: isWinner ? 'win' : 'timeout_loss',
              youWon: isWinner,
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
