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
import { I18nService } from '../../../common/i18n/i18n.service';

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
    private readonly i18n: I18nService,
  ) {}

  afterInit(server: Server) { applyWsAuth(server, this.config.get<string>('jwt.secret')!, this.redis); }

  handleConnection(client: Socket) { this.logger.log(`[NavalBattle] Connected: ${client.id}`); }

  handleDisconnect(client: Socket) {
    clearTimer(client.id);
    const { room_id, player_id } = client.data;
    if (!room_id || !player_id) return;
    this.processForfeit(client, room_id, player_id);
  }

  private getLang(client: Socket): string {
    return (client.handshake.headers['accept-language'] as string) || 'en';
  }

  private async processForfeit(client: Socket, room_id: string, player_id: string) {
    const room = await this.roomModel.findOne({ _id: new Types.ObjectId(room_id), 'players.playerId': new Types.ObjectId(player_id) });
    if (!room || room.status === 'finished') return;
    const lang = this.getLang(client);

    if (room.status === 'waiting') {
      const updated = await this.roomModel.findOneAndUpdate({ _id: new Types.ObjectId(room_id), 'players.playerId': new Types.ObjectId(player_id) }, { $pull: { players: { playerId: new Types.ObjectId(player_id) } } }, { returnDocument: 'after' });
      
      // Cleanup ALL placements for this room
      const roomOid = new Types.ObjectId(room_id);
      const allPlacements = await this.placementModel.find({ room_id: roomOid });
      const refundAmount = Number(room.bet_amount);
      
      for (const p of allPlacements) {
        if (refundAmount > 0) {
          await this.userModel.updateOne({ _id: p.player_id }, { $inc: { balance: refundAmount } });
        }
      }
      await this.placementModel.deleteMany({ room_id: roomOid });

      // Reset ready status for remaining players
      if (updated && updated.players.length > 0) {
        await this.roomModel.updateOne({ _id: roomOid }, { $set: { 'players.$[].ready': false } });
      }

      if (updated?.players.length === 0) await this.roomModel.findOneAndDelete({ _id: room_id, players: { $size: 0 } });
      else client.to(room_id).emit('naval-battle', { success: true, data: { opponentLeft: true, waitingForOpponent: true, resetPlacement: true }, messages: ['ws.games.opponentLeft'] });
      return;
    }
    if (room.status === 'started') {
      const winner_id = room.players.find((p: any) => p.playerId.toString() !== player_id)?.playerId;
      if (!winner_id) return;
      room.status = 'finished'; room.winner = winner_id; room.winner_reason = 'forfeit'; room.finished_at = new Date();
      await room.save();
      const prize = room.bet_amount * (2 - room.house_edge / 100);
      await this.userModel.findByIdAndUpdate(winner_id, { $inc: { balance: prize } });
      client.to(room_id).emit('naval-battle', { success: false, data: { outcome: 'opponent_disconnected', gameEnded: true }, messages: ['ws.games.playerDisconnected'] });
      const gameId = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
      if (gameId) this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
    }
  }

  @SubscribeMessage('join')
  async handleJoin(@ConnectedSocket() client: Socket, @MessageBody() payload: { room_id: string }) {
    const lang = this.getLang(client);
    if (!payload?.room_id) return client.emit('naval-battle', { success: false, messages: ['ws.invalidMessageFormat'] });
    const { room_id } = payload;
    const player_id = client.data.player_id;

    const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds');
    if (!room) return client.emit('naval-battle', { success: false, messages: ['ws.games.gameNotFound'] });

    const isMember = room.players.some((p: any) => p.playerId.toString() === player_id);
    if (!isMember) return client.emit('naval-battle', { success: false, messages: ['ws.games.notInRoom'] });

    await client.join(room_id);
    client.data.room_id = room_id;

    const socketsInRoom = await this.server.in(room_id).fetchSockets();
    if (socketsInRoom.length > 1) {
      const user = await this.userModel.findById(player_id).select('username');
      const username = user?.username || 'Opponent';
      client.to(room_id).emit('naval-battle', { success: true, data: { opponentJoined: true, opponentName: username }, messages: [this.i18n.translate('ws.games.opponentJoined', lang, { username })] });
    }

    const myPlacement = await this.placementModel.findOne({ room_id, player_id });
    if (myPlacement) {
      const isMyTurn = client.data.myTurn;
      return client.emit('naval-battle', { success: true, data: {
        ships: myPlacement.ships, shotsFired: myPlacement.shotsFired, status: myPlacement.status,
        waitingForOpponent: room.status === 'waiting', gameStarted: room.status === 'started',
        yourTurn: isMyTurn, turnTimerSeconds: 30
      }, messages: ['ws.games.roomReconnected'] });
    }

    client.emit('naval-battle', { success: true, data: { waitingForOpponent: true }, messages: ['ws.games.waitingOpponent'] });
  }

  @SubscribeMessage('place_ships')
  async handlePlaceShips(@ConnectedSocket() client: Socket, @MessageBody() payload: { room_id: string; ships: any[] }) {
    const lang = this.getLang(client);
    const { room_id, ships } = payload;
    const player_id = client.data.player_id;
    if (!room_id || !ships?.length) return client.emit('naval-battle', { success: false, messages: ['ws.invalidMessageFormat'] });

    const room = await this.roomModel.findById(room_id);
    if (!room) return client.emit('naval-battle', { success: false, messages: ['ws.games.gameNotFound'] });

    const existing = await this.placementModel.findOne({ room_id, player_id });
    if (existing) return client.emit('naval-battle', { success: false, messages: ['ws.games.shipsAlreadyPlaced'] });

    // Deduct bet when ships are placed (per original ship placement balance logic)
    const deducted = await this.userModel.findOneAndUpdate({ _id: player_id, balance: { $gte: room.bet_amount } }, { $inc: { balance: -room.bet_amount } });
    if (!deducted) return client.emit('naval-battle', { success: false, messages: ['ws.games.insufficientBalance'] });

    await this.placementModel.create({ room_id, player_id, ships, status: 'placed' });

    client.emit('naval-battle', { success: true, data: { shipsPlaced: true }, messages: ['ws.games.waitingOpponent'] });

    // Check if both players have placed
    const allPlacements = await this.placementModel.find({ room_id: new Types.ObjectId(room_id) });
    if (allPlacements.length === 2) {
      const startedRoom = await this.roomModel.findById(room_id).populate('game_id');
      if (!startedRoom) return;
      
      await this.roomModel.updateOne({ _id: room_id }, { $set: { status: 'started' } });
      await this.placementModel.updateMany({ room_id }, { status: 'ready' });
      
      const timerSeconds = (startedRoom.game_id as any)?.turn_timer_seconds ?? 30;
      this.logger.debug(`Game started in room ${room_id}. Timer: ${timerSeconds}s`);

      // Player 1 goes first
      const p1Player = startedRoom.players[0].playerId.toString();
      const allSockets = await this.server.in(room_id).fetchSockets();
      
      for (const s of allSockets) {
        const pid = (s as any).data.player_id;
        const isTurn = pid === p1Player;
        this.logger.debug(`Socket ${s.id} for player ${pid}: isTurn=${isTurn}`);
        
        const sLang = this.getLang(s as unknown as Socket);
        (s as unknown as Socket).emit('naval-battle', { 
          success: true, 
          data: { 
            gameStarted: true,
            yourTurn: isTurn, 
            turnTimerSeconds: timerSeconds,
            waitingForOpponent: false
          }, 
          messages: [isTurn ? 'ws.games.opponentReady' : 'ws.games.opponentReadyWait'] 
        });
        
        if (isTurn) {
          this.logger.debug(`Starting timer for socket ${s.id} (${pid})`);
          this.startTimer(s as unknown as Socket, room_id, timerSeconds);
        }
      }
    }
  }

  @SubscribeMessage('fire')
  async handleFire(@ConnectedSocket() client: Socket, @MessageBody() payload: { room_id: string; row: number; col: number }) {
    const lang = this.getLang(client);
    const { room_id, row, col } = payload;
    const player_id = client.data.player_id;
    if (!room_id || row === undefined || col === undefined) return client.emit('naval-battle', { success: false, messages: ['ws.invalidMessageFormat'] });

    const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds');
    if (!room || room.status !== 'started') return client.emit('naval-battle', { success: false, messages: ['ws.games.roomInactive'] });

    const timerSeconds = (room.game_id as any)?.turn_timer_seconds ?? 30;

    // Get both placements safely cast to ObjectIds
    const roomObjId = new Types.ObjectId(room_id);
    const myPlacement = await this.placementModel.findOne({ room_id: roomObjId, player_id: new Types.ObjectId(player_id) });
    const opponent = room.players.find((p: any) => p.playerId.toString() !== player_id);
    const opponentPlacement = await this.placementModel.findOne({ room_id: roomObjId, player_id: new Types.ObjectId(opponent?.playerId.toString()) });

    if (!myPlacement || !opponentPlacement) return client.emit('naval-battle', { success: false, messages: ['ws.games.placementNotFound'] });

    // Check if already fired here
    const alreadyFired = myPlacement.shotsFired.some(s => s[0] === row && s[1] === col);
    if (alreadyFired) return client.emit('naval-battle', { success: false, messages: ['ws.games.alreadyFiredCell'] });

    // Check for hit
    let hit = false, shipType: string | null = null;
    for (const ship of opponentPlacement.ships) {
      if (ship.cells.some(cell => cell[0] === row && cell[1] === col)) {
        hit = true;
        shipType = ship.type;
        // Check if entire ship is sunk
        const allHit = ship.cells.every(cell => myPlacement.shotsFired.some(s => s[0] === cell[0] && s[1] === cell[1]) || (cell[0] === row && cell[1] === col));
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
    else if (hit) {
      const allHit = opponentPlacement.ships.find(s => s.type === shipType)?.cells.every(cell => 
        myPlacement.shotsFired.some(s => s[0] === cell[0] && s[1] === cell[1])
      );
      outcome = allHit ? 'sunk' : 'hit';
    }

    // Update move history with outcome
    await this.roomModel.updateOne(
      { _id: roomObjId, 'players.playerId': new Types.ObjectId(player_id) },
      { $set: { [`players.${room.players.findIndex((p: any) => p.playerId.toString() === player_id)}.moves.${moveIndex}.data.outcome`]: outcome, [`players.${room.players.findIndex((p: any) => p.playerId.toString() === player_id)}.moves.${moveIndex}.data.shipType`]: shipType } }
    );

    if (allSunk) {
      room.status = 'finished'; room.winner = new Types.ObjectId(player_id); room.winner_reason = 'normal'; room.finished_at = new Date();
      await room.save();
      const prize = room.bet_amount + (room.bet_amount * (1 - room.house_edge / 100)); // Win original bet + opponent minus house edge
      await this.userModel.updateOne({ _id: player_id }, { $inc: { balance: prize } });
      
      const winMsg = this.i18n.translate('ws.games.winSunk', lang, { shipType: shipType || '' });
      client.emit('naval-battle', { success: true, data: { outcome: 'win', youWon: true, winner: player_id, reason: 'normal', row, col, shipType: shipType, prize, yourTurn: false, gameEnded: true }, messages: [winMsg] });
      
      const opponentSocketId = opponent?.playerId.toString();
      const sockets = await this.server.in(room_id).fetchSockets();
      for (const s of sockets) {
        if ((s as any).data.player_id === opponentSocketId) {
          const vLang = this.getLang(s as unknown as Socket);
          const loseMsg = this.i18n.translate('ws.games.loseSunk', vLang, { shipType: shipType || '' });
          (s as unknown as Socket).emit('naval-battle', { success: true, data: { outcome: 'lose', youWon: false, winner: player_id, reason: 'normal', row, col, shipType: shipType, yourTurn: false, gameEnded: true }, messages: [loseMsg] });
        }
      }
      
      const gameId = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
      if (gameId) this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
      return;
    }

    const keepTurn = outcome === 'hit';
    const shooterMsg = outcome === 'miss' 
      ? 'ws.games.shotMiss' 
      : outcome === 'sunk' 
        ? this.i18n.translate('ws.games.shotSunk', lang, { shipType: shipType || '' }) 
        : 'ws.games.shotHit';
    client.emit('naval-battle', { success: true, data: { outcome, row, col, shipType: (outcome === 'sunk' ? shipType : null), yourTurn: keepTurn, turnTimerSeconds: timerSeconds }, messages: [shooterMsg] });
    
    const opponentSocketId = opponent?.playerId.toString();
    const sockets = await this.server.in(room_id).fetchSockets();
    const opponentSocket = sockets.find(s => (s as any).data.player_id === opponentSocketId);
    
    const oppLang = opponentSocket ? this.getLang(opponentSocket as unknown as Socket) : 'en';
    const oppMsg = outcome === 'miss' 
      ? 'ws.games.opponentMiss' 
      : outcome === 'sunk' 
        ? this.i18n.translate('ws.games.opponentSunk', oppLang, { shipType: shipType || '' }) 
        : 'ws.games.opponentHit';
    clearTimer(client.id);
    if (!allSunk) {
      if (keepTurn) {
        this.startTimer(client, room_id, timerSeconds);
      } else if (opponentSocket) {
        this.startTimer(opponentSocket as unknown as Socket, room_id, timerSeconds);
      }
    }

    for (const s of sockets) {
      if ((s as any).data.player_id === opponentSocketId) {
        (s as unknown as Socket).emit('naval-battle', { success: true, data: { outcome: outcome === 'miss' ? 'miss' : outcome, row, col, shipType: (outcome === 'sunk' ? shipType : null), yourTurn: !keepTurn && !allSunk, turnTimerSeconds: timerSeconds }, messages: [oppMsg] });
      }
    }
  }

  public startTimer(socket: Socket, room_id: string, seconds: number) {
    this.logger.debug(`[TIMER] startTimer called for socket ${socket.id} in room ${room_id} for ${seconds}s`);
    clearTimer(socket.id);
    const t = setTimeout(async () => {
      this.logger.debug(`[TIMER] Timeout reached for socket ${socket.id} in room ${room_id}`);
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
          const sLang = this.getLang(s as unknown as Socket);
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
            messages: [isWinner ? 'ws.games.timeoutWin' : 'ws.games.timeoutLoss']
          });
        }
        
        const gameId = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
        if (gameId) this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
      }
    }, seconds * 1000);
    turnTimers.set(socket.id, t);
  }
}
