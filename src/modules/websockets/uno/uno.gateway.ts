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
import { UNO_SOCKET_CODE } from '../../../common/constants/uno-game.constants';
import { RoomsGateway } from '../rooms/rooms.gateway';
import { UnoGame, UnoGameDocument } from './schemas/uno-game.schema';
import {
  dealUnoInitialState,
  getNextUnoPlayerIndex,
  activePlayerCount,
  applyPlay,
  applyTakeDrawStack,
  applyDrawOne,
  applyPassTurn,
  UnoEngineState,
  UnoColor,
} from './uno-game.logic';
import { I18nService } from '../../../common/i18n/i18n.service';
import { winnerGrossPayout, winnerDisplayedPrize } from '../../../common/utils/game-prize.util';

const turnTimers = new Map<string, ReturnType<typeof setTimeout>>();
const clearTimer = (id: string) => {
  const t = turnTimers.get(id);
  if (t) {
    clearTimeout(t);
    turnTimers.delete(id);
  }
};

@WebSocketGateway({ namespace: '/uno', cors: { origin: '*', credentials: true } })
export class UnoGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(UnoGateway.name);
  private usernameCache = new Map<string, string>();

  constructor(
    @InjectModel(UnoGame.name) private readonly unoModel: Model<UnoGameDocument>,
    @InjectModel('Room') private readonly roomModel: Model<any>,
    @InjectModel('User') private readonly userModel: Model<any>,
    private readonly config: ConfigService,
    private readonly roomsGateway: RoomsGateway,
    @Inject(REDIS_CLIENT) private readonly redis: any,
    private readonly i18n: I18nService,
  ) {}

  private async runWithRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    let lastError: any;
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error: any) {
        if (error?.name === 'VersionError' || error?.message?.includes('version')) {
          this.logger.warn(`[UNO] Version collision, retry ${i + 1}/${maxRetries}`);
          lastError = error;
          await new Promise((r) => setTimeout(r, 50 * (i + 1)));
          continue;
        }
        throw error;
      }
    }
    throw lastError;
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

  private getHands(game: UnoGameDocument): Map<string, string[]> {
    if (game.hands instanceof Map) return game.hands;
    return new Map(Object.entries((game.hands as any) || {}));
  }

  afterInit(server: Server) {
    applyWsAuth(server, this.config, this.redis);
  }

  handleConnection(client: Socket) {
    this.logger.log(`[UNO] Connected: ${client.id}`);
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
      client.to(room_id).emit('uno', {
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
      if (updated.players.length === 0) {
        await this.roomModel.findOneAndDelete({ _id: roomObjId, players: { $size: 0 } });
      } else {
        const username = await this.getCachedUsername(player_id);
        const maxPlayers = room.player_limit || room.game_id?.max_players || 2;
        const lang = this.getLang(client);
        client.to(room_id).emit('uno', {
          success: true,
          data: {
            opponentLeft: true,
            waitingForOpponent: true,
            playerLeft: username,
            playersRemaining: updated.players.length,
            playersRequired: maxPlayers,
          },
          messages: [this.i18n.translate('ws.domino.playerLeftWaiting', lang, { username })],
        });
      }
      return;
    }

    if (room.status === 'started') {
      const reason = client.data.eliminationReason || 'forfeit';
      if (reason === 'timeout') {
        await this.eliminatePlayer(room_id, player_id, 'timeout');
        return;
      }

      const game = await this.unoModel.findOne({ room_id: roomObjId });
      let gracePeriod = 60;
      if (game) {
        const idsStr = game.player_ids.map((p: any) => p.toString());
        const currentId = idsStr[game.current_player_index];
        if (currentId === player_id) {
          const turnStart = game.turn_start_time?.getTime() ?? Date.now();
          const limit = (room.game_id?.turn_timer_seconds || 30) * 1000;
          gracePeriod = Math.max(5, Math.ceil((limit - (Date.now() - turnStart)) / 1000));
        }
      }

      const redisKey = `grace_period:uno:${player_id}`;
      await this.redis.set(redisKey, JSON.stringify({ room_id }), 'EX', gracePeriod);
      this.logger.log(`[UNO] Grace period | player=${player_id} | room=${room_id} | ${gracePeriod}s`);

      setTimeout(async () => {
        const still = await this.redis.get(redisKey);
        if (still) {
          await this.redis.del(redisKey);
          await this.eliminatePlayer(room_id, player_id, 'forfeit');
        }
      }, gracePeriod * 1000);
    }
  }

  @SubscribeMessage('join')
  async handleJoin(@ConnectedSocket() client: Socket, @MessageBody() payload: { room_id: string }) {
    const lang = this.getLang(client);
    const player_id = client.data.player_id;
    let room_id = payload?.room_id;

    const reconKey = `grace_period:uno:${player_id}`;
    const recon = await this.redis.get(reconKey);
    if (recon) {
      room_id = JSON.parse(recon).room_id;
      await this.redis.del(reconKey);
      this.logger.log(`[UNO] Reconnect | player=${player_id} | room=${room_id}`);
    }

    if (!room_id) {
      return client.emit('uno', {
        success: false,
        messages: [this.i18n.translate('ws.invalidMessageFormat', lang)],
      });
    }

    const room = await this.roomModel.findById(room_id).populate('game_id', 'socket_code turn_timer_seconds max_players');
    if (!room) {
      return client.emit('uno', {
        success: false,
        messages: [this.i18n.translate('ws.games.gameNotFound', lang)],
      });
    }
    if ((room.game_id as any)?.socket_code !== UNO_SOCKET_CODE) {
      return client.emit('uno', {
        success: false,
        messages: [this.i18n.translate('ws.uno.wrongGame', lang)],
      });
    }
    if (room.status === 'finished') {
      return client.emit('uno', {
        success: false,
        messages: [this.i18n.translate('ws.games.roomInactive', lang)],
      });
    }

    await client.join(room_id);
    client.data.room_id = room_id;

    const game = await this.unoModel.findOne({ room_id: new Types.ObjectId(room_id) });
    const isMember = room.players.some((p: any) => p.playerId.toString() === player_id);
    const isEliminated = game?.eliminated_players?.includes(player_id);
    client.data.isSpectator = !isMember || !!isEliminated;

    const timerSec = (room.game_id as any)?.turn_timer_seconds ?? 45;
    const maxPlayers = room.player_limit || (room.game_id as any)?.max_players || 10;

    if (client.data.isSpectator && game) {
      await this.emitUnoStateToClient(client, room, game, timerSec, lang);
      return;
    }

    if (!isMember) {
      return client.emit('uno', {
        success: false,
        messages: [this.i18n.translate('ws.games.notInRoom', lang)],
      });
    }

    const playerIndex = room.players.findIndex((p: any) => p.playerId.toString() === player_id);
    client.data.playerNum = playerIndex + 1;

    if (room.status === 'started' && game) {
      await this.emitUnoStateToClient(client, room, game, timerSec, lang);
      return;
    }

    const socketsInRoom = await this.server.in(room_id).fetchSockets();
    client.emit('uno', {
      success: true,
      data: {
        waitingForOpponent: true,
        isPlayerOne: playerIndex === 0,
        playersJoined: socketsInRoom.length,
        maxPlayers,
        isSpectator: false,
      },
      messages: [this.i18n.translate('ws.games.waitingOpponent', lang)],
    });

    if (socketsInRoom.length > 1 && room.status === 'waiting' && socketsInRoom.length < maxPlayers) {
      const username = await this.getCachedUsername(player_id);
      client.to(room_id).emit('uno', {
        success: true,
        data: {
          opponentJoined: true,
          opponentName: username,
          waitingForOpponent: true,
          playersJoined: socketsInRoom.length,
          maxPlayers,
        },
        messages: [this.i18n.translate('ws.games.opponentJoined', lang, { username })],
      });
    }

    if (socketsInRoom.length >= maxPlayers && room.status === 'waiting') {
      await this.tryStartUnoGame(room_id, lang);
    }
  }

  /** Idempotent start when the room is full and still waiting */
  private async tryStartUnoGame(room_id: string, lang: string) {
    const started = await this.roomModel.findOneAndUpdate(
      { _id: room_id, status: 'waiting' },
      { $set: { status: 'started' } },
      { returnDocument: 'after' },
    );
    if (!started) return;

    const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds max_players');
    if (!room) return;

    const playerIds = room.players.map((p: any) => p.playerId);
    const paid: Types.ObjectId[] = [];
    let allPaid = true;
    for (const pid of playerIds) {
      const deducted = await this.userModel.findOneAndUpdate(
        { _id: pid, balance: { $gte: room.bet_amount } },
        { $inc: { balance: -room.bet_amount } },
        { returnDocument: 'after' },
      );
      if (!deducted) {
        allPaid = false;
        break;
      }
      paid.push(pid);
    }
    if (!allPaid) {
      for (const pid of paid) await this.userModel.updateOne({ _id: pid }, { $inc: { balance: room.bet_amount } });
      await this.roomModel.findByIdAndUpdate(room_id, { $set: { status: 'waiting' } });
      this.server.to(room_id).emit('uno', {
        success: false,
        messages: [this.i18n.translate('ws.games.insufficientBalance', lang)],
      });
      return;
    }

    const playerIdStrs = playerIds.map((p: any) => p.toString());
    let deal;
    try {
      deal = dealUnoInitialState(playerIdStrs);
    } catch (e) {
      this.logger.error(`[UNO] Deal failed | room=${room_id}`, e);
      for (const pid of paid) await this.userModel.updateOne({ _id: pid }, { $inc: { balance: room.bet_amount } });
      await this.roomModel.findByIdAndUpdate(room_id, { $set: { status: 'waiting' } });
      this.server.to(room_id).emit('uno', {
        success: false,
        messages: [this.i18n.translate('ws.games.matchmakingError', lang)],
      });
      return;
    }

    await this.unoModel.create({
      room_id: new Types.ObjectId(room_id),
      player_ids: playerIds,
      hands: deal.hands,
      draw_pile: deal.drawPile,
      discard_pile: deal.discardPile,
      current_player_index: 0,
      direction: 1,
      current_color: deal.currentColor,
      draw_stack_pending: 0,
      eliminated_players: [],
      turn_start_time: new Date(),
    });

    const game = await this.unoModel.findOne({ room_id: new Types.ObjectId(room_id) });
    if (!game) return;

    const timerSec = (room.game_id as any)?.turn_timer_seconds ?? 45;
    const sockets = await this.server.in(room_id).fetchSockets();
    const currentTurnId = playerIdStrs[game.current_player_index];
    const currentTurnUsername = await this.getCachedUsername(currentTurnId);

    for (const s of sockets) {
      const pid = (s as any).data.player_id;
      const sLang = this.getLang(s as unknown as Socket);
      const isSpectator = (s as any).data.isSpectator || false;
      const isMyTurn = !isSpectator && pid === currentTurnId;
      const data = await this.buildUnoPayloadSync(game, room, pid, isSpectator, timerSec, currentTurnUsername);
      (s as unknown as Socket).emit('uno', {
        success: true,
        data: { ...data, gameStarted: true },
        messages: [
          isSpectator
            ? this.i18n.translate('ws.games.gameStarted', sLang)
            : isMyTurn
              ? this.i18n.translate('ws.games.yourTurn', sLang)
              : this.i18n.translate('ws.games.gameStarted', sLang),
        ],
      });
      if (isMyTurn) this.startTimer(s as unknown as Socket, room_id, timerSec);
    }

    const gId = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
    const populated = await this.roomModel.findById(room_id).populate('game_id', '-created_at').populate('players.playerId', 'username').lean();
    if (gId) this.roomsGateway.broadcastRoomUpdate(gId, 'roomUpdated', populated);
  }

  @SubscribeMessage('sync')
  async handleSync(@ConnectedSocket() client: Socket, @MessageBody() payload: { room_id?: string }) {
    const lang = this.getLang(client);
    const room_id = payload?.room_id || client.data.room_id;
    const player_id = client.data.player_id;
    if (!room_id) {
      return client.emit('uno', { success: false, messages: [this.i18n.translate('ws.invalidMessageFormat', lang)] });
    }

    const room = await this.roomModel.findById(room_id).populate('game_id', 'socket_code turn_timer_seconds max_players');
    if (!room) {
      return client.emit('uno', { success: false, messages: [this.i18n.translate('ws.games.gameNotFound', lang)] });
    }
    const game = await this.unoModel.findOne({ room_id: new Types.ObjectId(room_id) });
    if (!game || room.status !== 'started') {
      return client.emit('uno', { success: false, messages: [this.i18n.translate('ws.games.roomInactive', lang)] });
    }

    const timerSec = (room.game_id as any)?.turn_timer_seconds ?? 45;
    await this.emitUnoStateToClient(client, room, game, timerSec, lang);
  }

  @SubscribeMessage('play_card')
  async handlePlayCard(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { room_id?: string; card_index: number; chosen_color?: string },
  ) {
    const lang = this.getLang(client);
    if (client.data.isSpectator) {
      return client.emit('uno', {
        success: false,
        messages: [this.i18n.translate('ws.games.spectatorActionDenied', lang)],
      });
    }
    const room_id = payload?.room_id || client.data.room_id;
    const player_id = client.data.player_id;
    if (room_id === undefined || room_id === null || payload?.card_index === undefined || payload?.card_index === null) {
      return client.emit('uno', { success: false, messages: [this.i18n.translate('ws.invalidMessageFormat', lang)] });
    }
    const cardIndex = Number(payload.card_index);
    if (!Number.isInteger(cardIndex) || cardIndex < 0) {
      return client.emit('uno', { success: false, messages: [this.i18n.translate('ws.uno.invalidCard', lang)] });
    }

    let chosen: UnoColor | undefined;
    if (payload.chosen_color) {
      const c = String(payload.chosen_color).toUpperCase();
      if (!['R', 'G', 'B', 'Y'].includes(c)) {
        return client.emit('uno', { success: false, messages: [this.i18n.translate('ws.uno.chosenColorRequired', lang)] });
      }
      chosen = c as UnoColor;
    }

    await this.runWithRetry(async () => {
      const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds max_players');
      if (!room || room.status !== 'started') {
        return client.emit('uno', { success: false, messages: [this.i18n.translate('ws.games.roomInactive', lang)] });
      }
      const game = await this.unoModel.findOne({ room_id: new Types.ObjectId(room_id) });
      if (!game) {
        return client.emit('uno', { success: false, messages: [this.i18n.translate('ws.games.gameNotFound', lang)] });
      }

      const engine = this.gameToEngine(game);
      let nextState: UnoEngineState;
      let winnerId: string | undefined;
      try {
        const r = applyPlay(engine, player_id, cardIndex, { chosenColor: chosen });
        nextState = r.state;
        winnerId = r.winnerId;
      } catch (e: any) {
        const key = this.unoReasonToMessageKey(e?.message || '');
        return client.emit('uno', { success: false, messages: [this.i18n.translate(key, lang)] });
      }

      this.applyEngineToGame(game, nextState);
      await game.save();

      if (winnerId) {
        await this.finalizeUnoRoundWinner(room_id, room, game, winnerId);
        return;
      }

      await this.broadcastUnoGameState(room_id, room, game);
    });
  }

  @SubscribeMessage('take_draw_stack')
  async handleTakeDrawStack(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { room_id?: string },
  ) {
    const lang = this.getLang(client);
    if (client.data.isSpectator) {
      return client.emit('uno', {
        success: false,
        messages: [this.i18n.translate('ws.games.spectatorActionDenied', lang)],
      });
    }
    const room_id = payload?.room_id || client.data.room_id;
    const player_id = client.data.player_id;
    if (!room_id) {
      return client.emit('uno', { success: false, messages: [this.i18n.translate('ws.invalidMessageFormat', lang)] });
    }

    await this.runWithRetry(async () => {
      const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds max_players');
      if (!room || room.status !== 'started') {
        return client.emit('uno', { success: false, messages: [this.i18n.translate('ws.games.roomInactive', lang)] });
      }
      const game = await this.unoModel.findOne({ room_id: new Types.ObjectId(room_id) });
      if (!game) {
        return client.emit('uno', { success: false, messages: [this.i18n.translate('ws.games.gameNotFound', lang)] });
      }

      const engine = this.gameToEngine(game);
      let nextState: UnoEngineState;
      try {
        nextState = applyTakeDrawStack(engine, player_id).state;
      } catch (e: any) {
        const key = this.unoReasonToMessageKey(e?.message || '');
        return client.emit('uno', { success: false, messages: [this.i18n.translate(key, lang)] });
      }

      this.applyEngineToGame(game, nextState);
      await game.save();
      await this.broadcastUnoGameState(room_id, room, game);
    });
  }

  @SubscribeMessage('draw_one')
  async handleDrawOne(@ConnectedSocket() client: Socket, @MessageBody() payload: { room_id?: string }) {
    const lang = this.getLang(client);
    if (client.data.isSpectator) {
      return client.emit('uno', {
        success: false,
        messages: [this.i18n.translate('ws.games.spectatorActionDenied', lang)],
      });
    }
    const room_id = payload?.room_id || client.data.room_id;
    const player_id = client.data.player_id;
    if (!room_id) {
      return client.emit('uno', { success: false, messages: [this.i18n.translate('ws.invalidMessageFormat', lang)] });
    }

    await this.runWithRetry(async () => {
      const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds max_players');
      if (!room || room.status !== 'started') {
        return client.emit('uno', { success: false, messages: [this.i18n.translate('ws.games.roomInactive', lang)] });
      }
      const game = await this.unoModel.findOne({ room_id: new Types.ObjectId(room_id) });
      if (!game) {
        return client.emit('uno', { success: false, messages: [this.i18n.translate('ws.games.gameNotFound', lang)] });
      }

      const engine = this.gameToEngine(game);
      let nextState: UnoEngineState;
      try {
        nextState = applyDrawOne(engine, player_id).state;
      } catch (e: any) {
        const key = this.unoReasonToMessageKey(e?.message || '');
        return client.emit('uno', { success: false, messages: [this.i18n.translate(key, lang)] });
      }

      this.applyEngineToGame(game, nextState);
      await game.save();
      await this.broadcastUnoGameState(room_id, room, game);
    });
  }

  @SubscribeMessage('pass')
  async handlePass(@ConnectedSocket() client: Socket, @MessageBody() payload: { room_id?: string }) {
    const lang = this.getLang(client);
    if (client.data.isSpectator) {
      return client.emit('uno', {
        success: false,
        messages: [this.i18n.translate('ws.games.spectatorActionDenied', lang)],
      });
    }
    const room_id = payload?.room_id || client.data.room_id;
    const player_id = client.data.player_id;
    if (!room_id) {
      return client.emit('uno', { success: false, messages: [this.i18n.translate('ws.invalidMessageFormat', lang)] });
    }

    await this.runWithRetry(async () => {
      const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds max_players');
      if (!room || room.status !== 'started') {
        return client.emit('uno', { success: false, messages: [this.i18n.translate('ws.games.roomInactive', lang)] });
      }
      const game = await this.unoModel.findOne({ room_id: new Types.ObjectId(room_id) });
      if (!game) {
        return client.emit('uno', { success: false, messages: [this.i18n.translate('ws.games.gameNotFound', lang)] });
      }

      const engine = this.gameToEngine(game);
      let nextState: UnoEngineState;
      try {
        nextState = applyPassTurn(engine, player_id);
      } catch (e: any) {
        const key = this.unoReasonToMessageKey(e?.message || '');
        return client.emit('uno', { success: false, messages: [this.i18n.translate(key, lang)] });
      }

      this.applyEngineToGame(game, nextState);
      await game.save();
      await this.broadcastUnoGameState(room_id, room, game);
    });
  }

  private gameToEngine(game: UnoGameDocument): UnoEngineState {
    const h = this.getHands(game);
    const handsObj: Record<string, string[]> = {};
    for (const id of game.player_ids) {
      const sid = id.toString();
      handsObj[sid] = [...(h.get(sid) || [])];
    }
    return {
      playerIds: game.player_ids.map((p: any) => p.toString()),
      hands: handsObj,
      drawPile: [...game.draw_pile],
      discardPile: [...game.discard_pile],
      currentPlayerIndex: game.current_player_index,
      direction: game.direction as 1 | -1,
      currentColor: game.current_color as UnoColor,
      drawStackPending: game.draw_stack_pending ?? 0,
      eliminatedPlayers: [...(game.eliminated_players || [])],
    };
  }

  private applyEngineToGame(game: UnoGameDocument, eng: UnoEngineState): void {
    const m = new Map<string, string[]>();
    for (const [k, v] of Object.entries(eng.hands)) m.set(k, [...v]);
    game.hands = m as any;
    game.draw_pile = eng.drawPile;
    game.discard_pile = eng.discardPile;
    game.current_player_index = eng.currentPlayerIndex;
    game.direction = eng.direction;
    game.current_color = eng.currentColor;
    game.draw_stack_pending = eng.drawStackPending;
    game.eliminated_players = eng.eliminatedPlayers;
    game.turn_start_time = new Date();
    game.markModified('hands');
  }

  private unoReasonToMessageKey(reason: string): string {
    const map: Record<string, string> = {
      NOT_YOUR_TURN: 'ws.games.notYourTurn',
      NO_MATCH: 'ws.uno.noMatch',
      MUST_RESPOND_DRAW_STACK: 'ws.uno.mustRespondDrawStack',
      WILD4_ILLEGAL_HAS_COLOR: 'ws.uno.wild4Illegal',
      CHOSEN_COLOR_REQUIRED: 'ws.uno.chosenColorRequired',
      INVALID_CARD_INDEX: 'ws.uno.invalidCard',
      ELIMINATED: 'ws.uno.eliminated',
      NO_DRAW_STACK: 'ws.uno.noDrawStack',
      MUST_PLAY_OR_PASS_ONLY_IF_NO_RESPONSE: 'ws.uno.mustPlayStackCard',
      CANNOT_DRAW_WHILE_STACK: 'ws.uno.cannotDrawStack',
      DECK_EMPTY: 'ws.uno.deckEmpty',
      MUST_RESOLVE_STACK: 'ws.uno.mustResolveStack',
      HAS_LEGAL_PLAY: 'ws.uno.hasLegalPlay',
    };
    return map[reason] || 'ws.games.invalidMove';
  }

  private async clearTimersInRoom(room_id: string): Promise<void> {
    const sockets = await this.server.in(room_id).fetchSockets();
    for (const s of sockets) clearTimer(s.id);
  }

  private async broadcastUnoGameState(room_id: string, room: any, game: UnoGameDocument): Promise<void> {
    await this.clearTimersInRoom(room_id);
    const timerSec = (room.game_id as any)?.turn_timer_seconds ?? 45;
    const idsStr = game.player_ids.map((p: any) => p.toString());
    const currentTurnId = idsStr[game.current_player_index];
    const currentTurnUsername = await this.getCachedUsername(currentTurnId);
    const sockets = await this.server.in(room_id).fetchSockets();

    for (const s of sockets) {
      const pid = (s as any).data.player_id;
      const sLang = this.getLang(s as unknown as Socket);
      const sSpectator = (s as any).data.isSpectator || false;
      const payload = await this.buildUnoPayloadSync(game, room, pid, sSpectator, timerSec, currentTurnUsername);
      const isMyTurn = !sSpectator && pid === currentTurnId;
      (s as unknown as Socket).emit('uno', {
        success: true,
        data: { ...payload, gameStarted: true },
        messages: [isMyTurn ? this.i18n.translate('ws.games.yourTurn', sLang) : this.i18n.translate('ws.uno.stateUpdated', sLang)],
      });
      if (isMyTurn) this.startTimer(s as unknown as Socket, room_id, timerSec);
    }
  }

  private async finalizeUnoRoundWinner(
    room_id: string,
    room: any,
    game: UnoGameDocument,
    winnerId: string,
  ): Promise<void> {
    await this.clearTimersInRoom(room_id);
    room.status = 'finished';
    room.winner = new Types.ObjectId(winnerId);
    room.winner_reason = 'win';
    room.finished_at = new Date();
    const grossPayout = winnerGrossPayout(room.bet_amount, room.house_edge, room.players.length);
    await this.userModel.updateOne({ _id: winnerId }, { $inc: { balance: grossPayout } });
    await room.save();

    const gameId = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
    if (gameId) this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });

    const timerSec = (room.game_id as any)?.turn_timer_seconds ?? 45;
    const idsStr = game.player_ids.map((p: any) => p.toString());
    const currentTurnUsername = await this.getCachedUsername(winnerId);
    const sockets = await this.server.in(room_id).fetchSockets();
    const displayPrize = winnerDisplayedPrize(room.bet_amount, room.house_edge, room.players.length);

    for (const s of sockets) {
      const pid = (s as any).data.player_id;
      const sLang = this.getLang(s as unknown as Socket);
      const sSpectator = (s as any).data.isSpectator || false;
      const payload = await this.buildUnoPayloadSync(game, room, pid, sSpectator, timerSec, currentTurnUsername);
      const isWinner = !sSpectator && pid === winnerId;
      (s as unknown as Socket).emit('uno', {
        success: true,
        data: {
          ...payload,
          gameEnded: true,
          youWon: isWinner,
          winner: winnerId,
          prize: isWinner ? displayPrize : 0,
          outcome: 'win',
        },
        messages: [
          isWinner
            ? this.i18n.translate('ws.games.win', sLang)
            : this.i18n.translate('ws.uno.playerWonRound', sLang, { username: await this.getCachedUsername(winnerId) }),
        ],
      });
    }
  }

  private async emitUnoStateToClient(client: Socket, room: any, game: UnoGameDocument, timerSec: number, lang: string) {
    const player_id = client.data.player_id;
    const isSpectator = client.data.isSpectator || false;
    const idsStr = game.player_ids.map((p: any) => p.toString());
    const currentTurnId = idsStr[game.current_player_index];
    const currentTurnUsername = await this.getCachedUsername(currentTurnId);
    const payload = await this.buildUnoPayloadSync(game, room, player_id, isSpectator, timerSec, currentTurnUsername);
    client.emit('uno', { success: true, data: payload, messages: [] });
  }

  private async buildUnoPayloadSync(
    game: UnoGameDocument,
    room: any,
    viewerPlayerId: string,
    isSpectator: boolean,
    timerSec: number,
    currentTurnUsername: string,
  ) {
    const hands = this.getHands(game);
    const idsStr = game.player_ids.map((p: any) => p.toString());
    const handCount: Record<string, number> = {};
    for (const id of idsStr) {
      handCount[id] = (hands.get(id) || []).length;
    }
    const topDiscard = game.discard_pile?.length ? game.discard_pile[game.discard_pile.length - 1] : null;
    const currentTurnId = idsStr[game.current_player_index];
    const yourTurn = !isSpectator && currentTurnId === viewerPlayerId;
    const usernames: Record<string, string> = {};
    for (const id of idsStr) {
      usernames[id] = await this.getCachedUsername(id);
    }
    return {
      hand: isSpectator ? [] : hands.get(viewerPlayerId) || [],
      handCount,
      topDiscard,
      discardCount: game.discard_pile?.length ?? 0,
      drawPileCount: game.draw_pile?.length ?? 0,
      currentColor: game.current_color,
      direction: game.direction,
      currentPlayerIndex: game.current_player_index,
      currentTurnPlayerId: currentTurnId,
      currentTurnUsername,
      yourTurn,
      turnTimerSeconds: timerSec,
      drawStackPending: game.draw_stack_pending ?? 0,
      playerOrder: idsStr,
      usernames,
      waitingForOpponent: false,
      gameStarted: true,
      isSpectator,
      eliminatedPlayers: game.eliminated_players || [],
    };
  }

  private startTimer(socket: Socket, room_id: string, seconds: number) {
    const player_id = socket.data?.player_id;
    if (!player_id) return;
    clearTimer(socket.id);
    const t = setTimeout(async () => {
      const game = await this.unoModel.findOne({ room_id: new Types.ObjectId(room_id) });
      if (!game) return;
      const room = await this.roomModel.findById(room_id);
      if (!room || room.status !== 'started') return;
      const idsStr = game.player_ids.map((p: any) => p.toString());
      if (idsStr[game.current_player_index] !== player_id) return;

      const lang = this.getLang(socket);
      socket.emit('uno', {
        success: true,
        data: { gameEnded: true, outcome: 'timeout_loss', youWon: false, reason: 'timeout', isSpectator: false },
        messages: [this.i18n.translate('ws.domino.timeout', lang)],
      });
      socket.data.eliminationReason = 'timeout';
      await this.eliminatePlayer(room_id, player_id, 'timeout');
      socket.leave(room_id);
      socket.disconnect(true);
    }, seconds * 1000);
    turnTimers.set(socket.id, t);
  }

  public async eliminatePlayer(room_id: string, player_id: string, reason: 'forfeit' | 'timeout') {
    await this.runWithRetry(async () => {
      await this.redis.del(`grace_period:uno:${player_id}`);

      const game = await this.unoModel.findOne({ room_id: new Types.ObjectId(room_id) });
      if (!game) return;
      const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds');
      if (!room || room.status !== 'started') return;

      const idsStr = game.player_ids.map((p: any) => p.toString());
      const eliminated = game.eliminated_players || [];
      if (eliminated.includes(player_id)) return;

      const hands = this.getHands(game);
      const hand = hands.get(player_id) || [];
      if (hand.length > 0) {
        game.draw_pile = [...game.draw_pile, ...hand];
        hands.set(player_id, []);
      }

      const newEliminated = [...eliminated, player_id];
      game.eliminated_players = newEliminated;

      if (idsStr[game.current_player_index] === player_id) {
        game.current_player_index = getNextUnoPlayerIndex(
          game.current_player_index,
          idsStr,
          newEliminated,
          game.direction as 1 | -1,
        );
        game.turn_start_time = new Date();
      }

      const remaining = activePlayerCount(idsStr, newEliminated);
      let winnerId: string | undefined;
      if (remaining <= 1) {
        winnerId = idsStr.find((id) => !newEliminated.includes(id));
        room.status = 'finished';
        room.winner_reason = reason;
        room.finished_at = new Date();
        if (winnerId) {
          room.winner = new Types.ObjectId(winnerId);
          const grossPayout = winnerGrossPayout(room.bet_amount, room.house_edge, room.players.length);
          await this.userModel.updateOne({ _id: winnerId }, { $inc: { balance: grossPayout } });
        }
        await room.save();
        const gameId = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
        if (gameId) this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
      } else {
        await room.save();
      }

      game.hands = hands as any;
      game.markModified('hands');
      game.markModified('draw_pile');
      game.markModified('eliminated_players');
      await game.save();

      const sockets = await this.server.in(room_id).fetchSockets();
      const nextId = idsStr[game.current_player_index];
      const nextUsername = await this.getCachedUsername(nextId);
      const timerSec = (room.game_id as any)?.turn_timer_seconds ?? 45;
      const finished = remaining <= 1;

      for (const s of sockets) {
        const pid = (s as any).data.player_id;
        const sLang = this.getLang(s as unknown as Socket);
        const sSpectator = (s as any).data.isSpectator || false;
        const payload = await this.buildUnoPayloadSync(game, room, pid, sSpectator, timerSec, nextUsername);
        const isWinner = !sSpectator && finished && winnerId && pid === winnerId;
        const prize =
          isWinner && winnerId
            ? winnerDisplayedPrize(room.bet_amount, room.house_edge, room.players.length)
            : 0;

        let msg: string;
        if (finished) {
          msg = isWinner
            ? this.i18n.translate('ws.games.win', sLang)
            : this.i18n.translate('ws.games.gameOver', sLang);
        } else {
          msg = this.i18n.translate('ws.domino.playerEliminated', sLang, {
            username: await this.getCachedUsername(player_id),
          });
        }

        (s as unknown as Socket).emit('uno', {
          success: true,
          data: {
            ...payload,
            gameEnded: finished,
            youWon: isWinner,
            winner: finished && winnerId ? winnerId : undefined,
            prize,
            eliminationReason: reason,
          },
          messages: [msg],
        });

        if (!finished && !sSpectator && pid === nextId) {
          this.startTimer(s as unknown as Socket, room_id, timerSec);
        }
      }
    });
  }
}
