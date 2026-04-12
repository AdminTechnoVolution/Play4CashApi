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
import { Room, RoomStatus, RoomPlayer } from '../../room/schemas/room.schema';
import { RoomsGateway } from '../rooms/rooms.gateway';
import { I18nService } from '../../../common/i18n/i18n.service';
import { winnerGrossPayout, winnerDisplayedPrize } from '../../../common/utils/game-prize.util';

const turnTimers = new Map<string, ReturnType<typeof setTimeout>>();
const clearTimer = (id: string) => { const t = turnTimers.get(id); if (t) { clearTimeout(t); turnTimers.delete(id); } };

@WebSocketGateway({ namespace: '/naval-battle', cors: { origin: '*', credentials: true } })
export class NavalBattleGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(NavalBattleGateway.name);
  private usernameCache = new Map<string, string>();

  private async getCachedUsername(userId: string): Promise<string> {
    if (this.usernameCache.has(userId)) return this.usernameCache.get(userId)!;
    const user = await this.userModel.findById(userId).select('username').lean();
    const username = user?.username || 'Unknown';
    if (user) this.usernameCache.set(userId, username);
    return username;
  }

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

  async handleConnection(client: Socket) { 
    const player_id = client.data.player_id;
    if (player_id) {
      const room = await this.roomModel.findOne({ 
        status: { $in: [RoomStatus.STARTED, RoomStatus.WAITING] },
        'players.playerId': new Types.ObjectId(player_id)
      });
      if (room) {
        this.logger.log(`[NavalBattle] 🔄 Auto-reconnection detected | player=${player_id} | room=${room._id}`);
        await client.join(room._id.toString());
        client.data.room_id = room._id.toString();
        await this.syncPlayerState(client, room._id.toString(), player_id);
        
        // Cancel grace period forfeiture upon reconnection
        const redisKey = `grace_period:naval-battle:${player_id}`;
        await this.redis.del(redisKey);
        this.logger.log(`[NavalBattle] 🔄 Grace period CANCELLED for player=${player_id}`);
      }
    }
    this.logger.log(`[NavalBattle] Connected: ${client.id}`); 
  }

  async handleDisconnect(client: Socket) {
    const { room_id, player_id } = client.data;
    if (!room_id || !player_id) {
       clearTimer(client.id);
       return;
    }

    const room = await this.roomModel.findById(room_id);
    if (!room) return;

    // Store move count to calculate missed shots on reconnection
    const totalMoves = (room.players[0]?.moves?.length || 0) + (room.players[1]?.moves?.length || 0);
    await this.redis.set(`last_move_index:naval-battle:${room_id}:${player_id}`, totalMoves.toString(), 'EX', 300);

    // Save remaining turn time BEFORE clearing the timer
    if (turnTimers.has(client.id)) {
      await this.redis.set(`timer:naval-battle:${room_id}`, "30", 'EX', 60);
    }
    clearTimer(client.id);
    
    const isSpectator = room.spectators?.some((id: any) => id.toString() === player_id);
    if (isSpectator) {
      const updated = await this.roomModel.findOneAndUpdate({ _id: room_id }, { $pull: { spectators: new Types.ObjectId(player_id) } }, { returnDocument: 'after' });
      client.to(room_id).emit('naval-battle', { success: true, data: { spectatorsCount: updated?.spectators?.length || 0 }, messages: [] });
      return;
    }

    this.processForfeit(client, room_id, player_id);
  }

  private getLang(client: Socket): string {
    return (client.handshake?.query?.lang as string) || (client.data?.lang as string) || 'en';
  }

  private async processForfeit(client: Socket, room_id: string, player_id: string) {
    const room = await this.roomModel.findOne({ _id: new Types.ObjectId(room_id), 'players.playerId': new Types.ObjectId(player_id) }).populate('game_id', 'turn_timer_seconds');
    if (!room || room.status === 'finished') return;
    const lang = this.getLang(client);

    if (room.status === 'waiting') {
      const updated = await this.roomModel.findOneAndUpdate({ _id: new Types.ObjectId(room_id), 'players.playerId': new Types.ObjectId(player_id) }, { $pull: { players: { playerId: new Types.ObjectId(player_id) } } }, { returnDocument: 'after' });
      
      const roomOid = new Types.ObjectId(room_id);
      const allPlacements = await this.placementModel.find({ room_id: roomOid });
      const refundAmount = Number(room.bet_amount);
      
      for (const p of allPlacements) {
        if (refundAmount > 0) {
          await this.userModel.updateOne({ _id: p.player_id }, { $inc: { balance: refundAmount } });
        }
      }
      await this.placementModel.deleteMany({ room_id: roomOid });

      if (updated && updated.players.length > 0) {
        await this.roomModel.updateOne({ _id: roomOid }, { $set: { 'players.$[].ready': false } });
      }

      if (updated?.players.length === 0) await this.roomModel.findOneAndDelete({ _id: room_id, players: { $size: 0 } });
      else client.to(room_id).emit('naval-battle', { success: true, data: { opponentLeft: true, waitingForOpponent: true, resetPlacement: true }, messages: [this.i18n.translate('ws.games.opponentLeft', lang)] });
      return;
    }
    if (room.status === 'started') {
      const redisKey = `grace_period:naval-battle:${player_id}`;
      const limit = ((room.game_id as any)?.turn_timer_seconds || 30) * 1000;
      let gracePeriod = 60;

      if (room.turn_start_time) {
        const elapsed = Date.now() - new Date(room.turn_start_time).getTime();
        gracePeriod = Math.max(5, Math.ceil((limit - elapsed) / 1000));
      } else {
        this.logger.warn(`[NavalBattle] ⚠️ turn_start_time missing for room=${room_id}, defaulting grace to 30s`);
        gracePeriod = 30; // Fallback to standard turn length
      }

      await this.redis.set(redisKey, JSON.stringify({ room_id }), 'EX', gracePeriod);
      this.logger.log(`[NavalBattle] ⏳ Grace period started | player=${player_id} | room=${room_id} | seconds=${gracePeriod} | limit=${limit/1000}s`);

      // Schedule definitive forfeit
      setTimeout(async () => {
        const stillDisconnected = await this.redis.get(redisKey);
        if (stillDisconnected) {
          this.logger.log(`[NavalBattle] 🚪 Grace period EXPIRED, forfeiting player=${player_id}`);
          await this.redis.del(redisKey);
          await this.executeForfeit(room_id, player_id);
        }
      }, gracePeriod * 1000);
    }
  }

  private async executeForfeit(room_id: string, player_id: string) {
    const room = await this.roomModel.findOne({ _id: new Types.ObjectId(room_id), status: 'started' });
    if (!room) return;

    const winner_id = room.players.find((p: any) => p.playerId.toString() !== player_id)?.playerId;
    if (!winner_id) return;

    room.status = 'finished' as any;
    room.winner = winner_id;
    room.winner_reason = 'forfeit';
    room.finished_at = new Date();
    await room.save();

    const grossPayout = winnerGrossPayout(room.bet_amount, room.house_edge, room.players.length);
    await this.userModel.findByIdAndUpdate(winner_id, { $inc: { balance: grossPayout } });

    const winnerUsername = await this.getCachedUsername(winner_id.toString());
    const sockets = await this.server.in(room_id).fetchSockets();
    for (const s of sockets) {
      const sIsSpectator = (s as any).data.isSpectator || false;
      const sLang = this.getLang(s as unknown as Socket);
      (s as unknown as Socket).emit('naval-battle', {
        success: false,
        data: { outcome: 'opponent_disconnected', gameEnded: true, winner: sIsSpectator ? winnerUsername : winner_id, isSpectator: sIsSpectator },
        messages: sIsSpectator ? [this.i18n.translate('ws.games.winsForfeit', sLang, { username: winnerUsername })] : [this.i18n.translate('ws.games.playerDisconnected', sLang)]
      });
    }
    const gameId = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
    if (gameId) this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
  }

  @SubscribeMessage('join')
  async handleJoin(@ConnectedSocket() client: Socket, @MessageBody() payload: { room_id: string }) {
    const player_id = client.data.player_id;
    let room_id = payload?.room_id;

    // Check for reconnection session in Redis (grace period)
    const redisKey = `grace_period:naval-battle:${player_id}`;
    const reconData = await this.redis.get(redisKey);

    if (reconData) {
      const parsed = JSON.parse(reconData);
      room_id = parsed.room_id;
      await this.redis.del(redisKey);
      this.logger.log(`[NavalBattle] 🔄 Reconnection detected via JOIN | player=${player_id} | room=${room_id}`);
    }

    await this.syncPlayerState(client, room_id, player_id);
  }

  private async syncPlayerState(client: Socket, room_id: string, player_id: string) {
    const lang = this.getLang(client);
    if (!room_id) return client.emit('naval-battle', { success: false, messages: [this.i18n.translate('ws.invalidMessageFormat', lang)] });
    
    const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds');
    if (!room) return client.emit('naval-battle', { success: false, messages: [this.i18n.translate('ws.games.gameNotFound', lang)] });
    if (room.status === RoomStatus.FINISHED) return client.emit('naval-battle', { success: false, messages: [this.i18n.translate('ws.games.roomInactive', lang)] });

    const isMember = room.players.some((p: any) => p.playerId.toString() === player_id);
    const isSpectator = room.spectators?.some((id: any) => id.toString() === player_id);
    if (!isMember && !isSpectator) return client.emit('naval-battle', { success: false, messages: [this.i18n.translate('ws.games.notInRoom', lang)] });

    await client.join(room_id);
    client.data.room_id = room_id;
    client.data.isSpectator = !isMember;

    if (client.data.isSpectator) {
      this.logger.log(`[NavalBattle] 👀 Spectator joined | room=${room_id} | player=${player_id}`);
      const p1Id = room.players[0]?.playerId?.toString();
      const p2Id = room.players[1]?.playerId?.toString();
      const player1 = p1Id ? await this.getCachedUsername(p1Id) : 'Unknown';
      const player2 = p2Id ? await this.getCachedUsername(p2Id) : 'Unknown';

      let shotFrom = 'Unknown';
      if (room.status === RoomStatus.STARTED) {
        const sockets = await this.server.in(room_id).fetchSockets();
        const activeTimerSocket = sockets.find(s => turnTimers.has(s.id) && !(s as any).data.isSpectator);
        if (activeTimerSocket) {
           shotFrom = await this.getCachedUsername((activeTimerSocket as any).data.player_id);
        } else {
           shotFrom = player1;
        }
      }

      return client.emit('naval-battle', { success: true, data: {
        waitingForOpponent: false, gameStarted: room.status === RoomStatus.STARTED,
        yourTurn: false, turnTimerSeconds: 30,
        isSpectator: true, spectatorsCount: room.spectators.length,
        player1, player2, shotFrom, turnOf: shotFrom,
        history: room.players.flatMap((p, i) => p.moves.map(m => ({ ...m.data, player: i === 0 ? player1 : player2 })))
      }, messages: [] });
    }

    const socketsInRoom = await this.server.in(room_id).fetchSockets();
    if (socketsInRoom.length > 1) {
      const username = await this.getCachedUsername(player_id);
      client.to(room_id).emit('naval-battle', { success: true, data: { opponentJoined: true, opponentName: username }, messages: [this.i18n.translate('ws.games.opponentJoined', lang, { username })] });
    }

    const p1Id = room.players[0]?.playerId?.toString();
    const p2Id = room.players[1]?.playerId?.toString();
    const player1 = p1Id ? await this.getCachedUsername(p1Id) : 'Unknown';
    const player2 = p2Id ? await this.getCachedUsername(p2Id) : 'Unknown';
    const opponent_id = room.players.find((p: any) => p.playerId.toString() !== player_id)?.playerId?.toString();

    const roomObjId = new Types.ObjectId(room_id);
    const playerObjId = new Types.ObjectId(player_id);
    const opponentObjId = opponent_id ? new Types.ObjectId(opponent_id) : null;

    const [myPlacement, opponentPlacement, timeLeft, lastMoveIndexStr] = await Promise.all([
      this.placementModel.findOne({ room_id: roomObjId, player_id: playerObjId }),
      opponentObjId ? this.placementModel.findOne({ room_id: roomObjId, player_id: opponentObjId }) : null,
      this.redis.get(`timer:naval-battle:${room_id}`),
      this.redis.get(`last_move_index:naval-battle:${room_id}:${player_id}`)
    ]);

    if (myPlacement) {
      const history = room.players.flatMap((p, i) => p.moves.map(m => ({ ...m.data, player: i === 0 ? player1 : player2 })));
      
      let missedShots = [];
      if (lastMoveIndexStr) {
        const lastIndex = parseInt(lastMoveIndexStr);
        missedShots = history.slice(lastIndex);
        await this.redis.del(`last_move_index:naval-battle:${room_id}:${player_id}`);
      }

      const sockets = await this.server.in(room_id).fetchSockets();
      const opponentSocket = sockets.find(s => (s as any).data.player_id === opponent_id && !(s as any).data.isSpectator);
      const isOpponentTurn = opponentSocket && turnTimers.has(opponentSocket.id);
      const isMyTurn = !isOpponentTurn && room.status === RoomStatus.STARTED;

      if (isMyTurn) {
        const remaining = Number(timeLeft) || 30;
        this.startTimer(client, room_id, remaining);
        await this.redis.del(`timer:naval-battle:${room_id}`);
      }

      return client.emit('naval-battle', { success: true, data: {
        ships: myPlacement.ships,
        shotsFired: myPlacement.shotsFired,
        shotsReceived: opponentPlacement?.shotsFired || [],
        status: myPlacement.status,
        waitingForOpponent: room.status === RoomStatus.WAITING,
        gameStarted: room.status === RoomStatus.STARTED,
        yourTurn: isMyTurn,
        turnTimerSeconds: 30,
        isSpectator: false,
        player1, player2,
        turnOf: isMyTurn ? player1 : player2,
        history,
        missedShots
      }, messages: [this.i18n.translate('ws.games.roomReconnected', lang)] });
    }

    client.emit('naval-battle', { success: true, data: { waitingForOpponent: true, isSpectator: false }, messages: [this.i18n.translate('ws.games.waitingOpponent', lang)] });
  }

  @SubscribeMessage('place_ships')
  async handlePlaceShips(@ConnectedSocket() client: Socket, @MessageBody() payload: { room_id: string; placements: any[] }) {
    const lang = this.getLang(client);
    const room_id = payload.room_id || client.data.room_id;
    const ships = payload.placements || (payload as any).ships;
    if (!room_id || !ships) {
      this.logger.warn(`[NavalBattle] ❌ Invalid place_ships payload | player=${client.data.player_id} | payload=${JSON.stringify(payload)} | socketRoom=${client.data.room_id}`);
      return client.emit('naval-battle', { success: false, messages: [this.i18n.translate('ws.games.invalidMove', lang)] });
    }
    const player_id = client.data.player_id;

    const room = await this.roomModel.findById(room_id);
    if (!room) return client.emit('naval-battle', { success: false, messages: [this.i18n.translate('ws.games.gameNotFound', lang)] });

    const existing = await this.placementModel.findOne({ room_id, player_id });
    if (existing) return client.emit('naval-battle', { success: false, messages: [this.i18n.translate('ws.games.shipsAlreadyPlaced', lang)] });

    const deducted = await this.userModel.findOneAndUpdate({ _id: player_id, balance: { $gte: room.bet_amount } }, { $inc: { balance: -room.bet_amount } });
    if (!deducted) return client.emit('naval-battle', { success: false, messages: [this.i18n.translate('ws.games.insufficientBalance', lang)] });

    await this.placementModel.create({ room_id, player_id, ships, status: 'placed' });

    client.emit('naval-battle', { success: true, data: { shipsPlaced: true }, messages: [this.i18n.translate('ws.games.waitingOpponent', lang)] });

    const allPlacements = await this.placementModel.find({ room_id: new Types.ObjectId(room_id) });
    if (allPlacements.length === 2) {
      const startedRoom = await this.roomModel.findById(room_id).populate('game_id');
      if (!startedRoom) return;
      
      await this.roomModel.updateOne({ _id: room_id }, { $set: { status: 'started', turn_start_time: new Date() } });
      await this.placementModel.updateMany({ room_id }, { status: 'ready' });
      
      const timerSeconds = (startedRoom.game_id as any)?.turn_timer_seconds ?? 30;
      const p1Player = startedRoom.players[0].playerId.toString();
      const allSockets = await this.server.in(room_id).fetchSockets();
      
      for (const s of allSockets) {
        const pid = (s as any).data.player_id;
        const sIsSpectator = (s as any).data.isSpectator || false;
        const isTurn = pid === p1Player;
        const sLang = this.getLang(s as unknown as Socket);
        (s as unknown as Socket).emit('naval-battle', { success: true, data: { gameStarted: true, yourTurn: isTurn && !sIsSpectator, turnTimerSeconds: timerSeconds, waitingForOpponent: false, isSpectator: sIsSpectator }, messages: sIsSpectator ? [this.i18n.translate('ws.games.startedRoom', sLang)] : [isTurn ? this.i18n.translate('ws.games.opponentReady', sLang) : this.i18n.translate('ws.games.opponentReadyWait', sLang)] });
        if (isTurn && !sIsSpectator) this.startTimer(s as unknown as Socket, room_id, timerSeconds);
      }
      const gId = (startedRoom.game_id as any)?._id?.toString() || startedRoom.game_id?.toString();
      const populated = await this.roomModel.findById(room_id).populate('game_id', '-created_at').populate('players.playerId', 'username').lean();
      if (gId) this.roomsGateway.broadcastRoomUpdate(gId, 'roomUpdated', populated);
    }
  }

  @SubscribeMessage('fire')
  async handleFire(@ConnectedSocket() client: Socket, @MessageBody() payload: { room_id: string; target: { row: number, col: number } }) {
    const lang = this.getLang(client);
    const room_id = payload.room_id || client.data.room_id;
    let { target } = payload;
    
    // Support flattened row/col (compatibility)
    if (!target && (payload as any).row !== undefined && (payload as any).col !== undefined) {
      target = { row: Number((payload as any).row), col: Number((payload as any).col) };
    }

    if (!room_id || !target) {
      this.logger.warn(`[NavalBattle] ❌ Invalid fire payload | player=${client.data.player_id} | payload=${JSON.stringify(payload)} | socketRoom=${client.data.room_id}`);
      return client.emit('naval-battle', { success: false, messages: [this.i18n.translate('ws.games.invalidMove', lang)] });
    }
    const { row, col } = target;
    const player_id = client.data.player_id;
    
    if (client.data.isSpectator) return client.emit('naval-battle', { success: false, messages: [this.i18n.translate('ws.games.spectatorActionDenied', lang)] });
    this.logger.log(`[NavalBattle] 💥 Fire received | room=${room_id} | player=${player_id} | target=[${row},${col}]`);

    const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds');
    if (!room || room.status !== 'started') return client.emit('naval-battle', { success: false, messages: [this.i18n.translate('ws.games.roomInactive', lang)] });

    const timerSeconds = (room.game_id as any)?.turn_timer_seconds ?? 30;
    const roomObjId = new Types.ObjectId(room_id);
    const myPlacement = await this.placementModel.findOne({ room_id: roomObjId, player_id: new Types.ObjectId(player_id) });
    const opponent = room.players.find((p: any) => p.playerId.toString() !== player_id);
    const opponentPlacement = await this.placementModel.findOne({ room_id: roomObjId, player_id: new Types.ObjectId(opponent?.playerId.toString()) });

    if (!myPlacement || !opponentPlacement) return client.emit('naval-battle', { success: false, messages: [this.i18n.translate('ws.games.placementNotFound', lang)] });

    const alreadyFired = myPlacement.shotsFired.some(s => s[0] === row && s[1] === col);
    if (alreadyFired) return client.emit('naval-battle', { success: false, messages: [this.i18n.translate('ws.games.alreadyFiredCell', lang)] });

    let hit = false, shipType: string | null = null;
    for (const ship of opponentPlacement.ships) {
      if (ship.cells.some(cell => cell[0] === row && cell[1] === col)) {
        hit = true;
        shipType = ship.type;
        break;
      }
    }

    myPlacement.shotsFired.push([row, col]);
    await myPlacement.save();

    const moveIndex = room.players.find((p: any) => p.playerId.toString() === player_id)?.moves?.length ?? 0;
    await this.roomModel.updateOne({ _id: roomObjId, 'players.playerId': new Types.ObjectId(player_id) }, { $push: { 'players.$.moves': { data: { row, col, outcome: 'pending' } } } });

    const allSunk = opponentPlacement.ships.every(ship => ship.cells.every(cell => myPlacement.shotsFired.some(s => s[0] === cell[0] && s[1] === cell[1])));

    let outcome = 'miss';
    if (allSunk) outcome = 'win';
    else if (hit) {
      const allHit = opponentPlacement.ships.find(s => s.type === shipType)?.cells.every(cell => myPlacement.shotsFired.some(s => s[0] === cell[0] && s[1] === cell[1]));
      outcome = allHit ? 'sunk' : 'hit';
    }

    await this.roomModel.updateOne({ _id: roomObjId, 'players.playerId': new Types.ObjectId(player_id) }, { $set: { [`players.${room.players.findIndex((p: any) => p.playerId.toString() === player_id)}.moves.${moveIndex}.data.outcome`]: outcome, [`players.${room.players.findIndex((p: any) => p.playerId.toString() === player_id)}.moves.${moveIndex}.data.shipType`]: shipType } });

    if (allSunk) {
      room.status = 'finished'; room.winner = new Types.ObjectId(player_id); room.winner_reason = 'normal'; room.finished_at = new Date();
      await room.save();
      const grossPayout = winnerGrossPayout(room.bet_amount, room.house_edge, room.players.length);
      const displayPrize = winnerDisplayedPrize(room.bet_amount, room.house_edge, room.players.length);
      await this.userModel.updateOne({ _id: player_id }, { $inc: { balance: grossPayout } });
      
      const p1Id = room.players[0]?.playerId?.toString();
      const player1 = await this.getCachedUsername(p1Id);
      const player2 = await this.getCachedUsername(room.players[1]?.playerId?.toString());
      const winnerUsername = await this.getCachedUsername(player_id);

      const sockets = await this.server.in(room_id).fetchSockets();
      for (const s of sockets) {
        const sIsSpectator = (s as any).data.isSpectator || false;
        const sLang = this.getLang(s as unknown as Socket);
        const pid = (s as any).data.player_id;
        const isWinner = pid === player_id;
        const sData: any = { outcome: isWinner ? 'win' : 'lose', youWon: isWinner && !sIsSpectator, winner: isWinner ? (sIsSpectator ? winnerUsername : player_id) : (sIsSpectator ? winnerUsername : player_id), reason: 'normal', row, col, shipType, prize: isWinner ? displayPrize : 0, yourTurn: false, gameEnded: true, isSpectator: sIsSpectator };
        if (sIsSpectator) { sData.player1 = player1; sData.player2 = player2; sData.shotFrom = winnerUsername; sData.turnOf = winnerUsername; sData.winner = winnerUsername; }
        
        let msg = '';
        if (isWinner) msg = this.i18n.translate('ws.games.winSunk', sLang, { shipType: shipType || '' });
        else if (sIsSpectator) msg = this.i18n.translate('ws.games.wins', sLang, { username: winnerUsername });
        else msg = this.i18n.translate('ws.games.loseSunk', sLang, { shipType: shipType || '' });

        (s as unknown as Socket).emit('naval-battle', { success: true, data: sData, messages: [msg] });
      }
      
      const gameId = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
      if (gameId) this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
      return;
    }

    const keepTurn = outcome === 'hit';
    const shooterUsername = await this.getCachedUsername(player_id);
    const sockets = await this.server.in(room_id).fetchSockets();
    
    clearTimer(client.id);
    
    // Always update turn_start_time on any shot attempt to match timer reset
    room.turn_start_time = new Date();
    await room.save();

    if (keepTurn) this.startTimer(client, room_id, timerSeconds);
    else {
      const oppSocket = sockets.find(s => (s as any).data.player_id === opponent?.playerId.toString());
      if (opponent && oppSocket) {
        this.startTimer(oppSocket as unknown as Socket, room_id, 30);
      }
    }

    const p1Id = room.players[0]?.playerId?.toString();
    const player1 = await this.getCachedUsername(p1Id);
    const player2 = await this.getCachedUsername(room.players[1]?.playerId?.toString());

    for (const s of sockets) {
      const sIsSpectator = (s as any).data.isSpectator || false;
      const sLang = this.getLang(s as unknown as Socket);
      const pid = (s as any).data.player_id;
      const isShooter = pid === player_id;
      const sData: any = { outcome, row, col, shipType: (outcome === 'sunk' ? shipType : null), yourTurn: (isShooter ? keepTurn : !keepTurn) && !sIsSpectator, turnTimerSeconds: timerSeconds, isSpectator: sIsSpectator };
      if (sIsSpectator) { sData.player1 = player1; sData.player2 = player2; sData.shotFrom = shooterUsername; sData.turnOf = keepTurn ? shooterUsername : (player_id === p1Id ? player2 : player1); }

      let msg = '';
      if (isShooter) {
        if (outcome === 'miss') msg = this.i18n.translate('ws.games.shotMiss', sLang);
        else if (outcome === 'sunk') msg = this.i18n.translate('ws.games.shotSunk', sLang, { shipType: shipType || '' });
        else msg = this.i18n.translate('ws.games.shotHit', sLang);
      } else {
        if (sIsSpectator) msg = outcome === 'miss' ? this.i18n.translate('ws.games.shotMiss', sLang) : this.i18n.translate('ws.games.shotHit', sLang);
        else {
          if (outcome === 'miss') msg = this.i18n.translate('ws.games.opponentMiss', sLang);
          else if (outcome === 'sunk') msg = this.i18n.translate('ws.games.opponentSunk', sLang, { shipType: shipType || '' });
          else msg = this.i18n.translate('ws.games.opponentHit', sLang);
        }
      }
      (s as unknown as Socket).emit('naval-battle', { success: true, data: sData, messages: [msg] });
    }
  }

  public startTimer(socket: Socket, room_id: string, seconds: number) {
    if (!socket?.id) return;
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
        const grossPayout = winnerGrossPayout(room.bet_amount, room.house_edge, room.players.length);
        const displayPrize = winnerDisplayedPrize(room.bet_amount, room.house_edge, room.players.length);
        await this.userModel.updateOne({ _id: winnerId }, { $inc: { balance: grossPayout } });
        
        const winnerUsername = await this.getCachedUsername(winnerId.toString());
        const sockets = await this.server.in(room_id).fetchSockets();
        for (const s of sockets) {
          const sLang = this.getLang(s as unknown as Socket);
          const socketPlayerId = (s as any).data.player_id;
          const isWinner = socketPlayerId === winnerId.toString();
          const sIsSpectator = (s as any).data.isSpectator || false;
          (s as unknown as Socket).emit('naval-battle', {
            success: true,
            data: { gameEnded: true, outcome: isWinner ? 'win' : 'timeout_loss', youWon: isWinner && !sIsSpectator, winner: sIsSpectator ? winnerUsername : winnerId, reason: 'timeout', prize: isWinner ? displayPrize : 0, isSpectator: sIsSpectator },
            messages: sIsSpectator ? [this.i18n.translate('ws.games.winsTimeout', sLang, { username: winnerUsername })] : [isWinner ? this.i18n.translate('ws.games.timeoutWin', sLang) : this.i18n.translate('ws.games.timeoutLoss', sLang)]
          });
        }
        
        const gameId = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
        if (gameId) this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
      }
    }, seconds * 1000);
    turnTimers.set(socket.id, t);
  }
}
