import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  MessageBody, ConnectedSocket, OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit,
} from '@nestjs/websockets';
import { Inject, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { GracePeriodService } from '../../../common/grace-period/grace-period.service';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { Model, Types } from 'mongoose';
import { applyWsAuth } from '../../../common/guards/ws-auth.middleware';
import { REDIS_CLIENT } from '../../../common/redis/redis.module';
import { RoomsGateway } from '../rooms/rooms.gateway';
import { DominoGame, DominoGameDocument } from './schemas/domino-game.schema';
import { deal, getStartingPlayerIndex, getNextActivePlayerIndex, hasValidMoves, validateMove, getDominoGameResult } from './domino-game.logic';
import { I18nService } from '../../../common/i18n/i18n.service';
import { winnerGrossPayout, winnerDisplayedPrize } from '../../../common/utils/game-prize.util';

const turnTimers = new Map<string, ReturnType<typeof setTimeout>>();
const clearTimer = (id: string) => { const t = turnTimers.get(id); if (t) { clearTimeout(t); turnTimers.delete(id); } };

@WebSocketGateway({ namespace: '/domino', cors: { origin: '*', credentials: true } })
export class DominoGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(DominoGateway.name);
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
    @InjectModel(DominoGame.name) private readonly dominoModel: Model<DominoGameDocument>,
    @InjectModel('Room') private readonly roomModel: Model<any>,
    @InjectModel('User') private readonly userModel: Model<any>,
    private readonly config: ConfigService,
    private readonly roomsGateway: RoomsGateway,
    @Inject(REDIS_CLIENT) private readonly redis: any,
    private readonly i18n: I18nService,
    private readonly grace: GracePeriodService,
  ) {}

  /**
   * Phase B: register the forfeit handler. Domino previously had NO scheduled forfeit
   * on disconnect (Redis grace key only routed reconnects), leaving matches
   * indefinitely stuck. This wires up the distributed sweeper.
   */
  onModuleInit() {
    this.grace.registerHandler('domino', (playerId, roomId) =>
      this.eliminatePlayer(roomId, playerId, 'forfeit'),
    );
  }

  private async runWithRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    let lastError;
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (error.name === 'VersionError' || error.message?.includes('version')) {
          this.logger.warn(`[Domino] 🔄 Version collision detected, retrying... (${i + 1}/${maxRetries})`);
          lastError = error;
          await new Promise(resolve => setTimeout(resolve, 50 * (i + 1))); // Incremental backoff
          continue;
        }
        throw error;
      }
    }
    this.logger.error(`[Domino] ❌ Max retries reached for game action`);
    throw lastError;
  }

  afterInit(server: Server) { applyWsAuth(server, this.config, this.redis); }

  handleConnection(client: Socket) { this.logger.log(`[Domino] Connected: ${client.id}`); }

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
      const updated = await this.roomModel.findOneAndUpdate({ _id: roomObjId }, { $pull: { spectators: playerObjId } }, { returnDocument: 'after' });
      client.to(room_id).emit('domino', { success: true, data: { spectatorsCount: updated?.spectators?.length || 0 }, messages: [] });
      return;
    }

    if (room.status === 'waiting') {
      const updated = await this.roomModel.findOneAndUpdate({ _id: roomObjId, 'players.playerId': playerObjId }, { $pull: { players: { playerId: playerObjId } } }, { returnDocument: 'after' });
      if (!updated) return;
      const gameIdForLobby = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
      if (updated.players.length === 0) {
        await this.roomModel.findOneAndDelete({ _id: roomObjId, players: { $size: 0 } });
        // Phase D: lobby must learn that this empty waiting room was deleted.
        if (gameIdForLobby) this.roomsGateway.broadcastRoomUpdate(gameIdForLobby, 'roomDeleted', { id: room_id });
      } else {
        const username = await this.getCachedUsername(player_id);
        const maxPlayers = room.player_limit || room.game_id?.max_players || 2;
        const lang = this.getLang(client);
        client.to(room_id).emit('domino', {
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
        // Phase D: broadcast the new player count so the lobby join button updates.
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
      const reason = client.data.eliminationReason || 'forfeit';
      if (reason === 'timeout') {
        // Already a timeout elimination, proceed
        await this.eliminatePlayer(room_id, player_id, reason);
        return;
      }

      // Phase B: accidental disconnect — distributed grace via GracePeriodService.
      // Previously Domino only persisted a Redis grace key but never scheduled the
      // forfeit, so a match could hang indefinitely if the player never came back.
      const game = await this.dominoModel.findOne({ room_id: roomObjId });
      let remainingTurnSecs = 0;
      if (game) {
        const currentPlayerId = game.player_ids[game.current_player_index]?.toString();
        if (currentPlayerId === player_id && game.turn_start_time) {
          const limit = (room.game_id?.turn_timer_seconds || 30) * 1000;
          remainingTurnSecs = Math.ceil((limit - (Date.now() - game.turn_start_time.getTime())) / 1000);
        }
      }
      await this.grace.start('domino', player_id, room_id, Math.max(60, remainingTurnSecs));
    }
  }

  @SubscribeMessage('join')
  async handleJoin(@ConnectedSocket() client: Socket, @MessageBody() payload: { room_id: string }) {
    const lang = this.getLang(client);
    const player_id = client.data.player_id;
    const room_id = payload?.room_id;
    // Phase B: cancel any open disconnect grace via the distributed service.
    await this.grace.cancel('domino', player_id);

    if (!room_id) return client.emit('domino', { success: false, messages: [this.i18n.translate('ws.invalidMessageFormat', lang)] });
    
    const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds max_players');
    if (!room) return client.emit('domino', { success: false, messages: [this.i18n.translate('ws.games.gameNotFound', lang)] });
    if (room.status === 'finished') return client.emit('domino', { success: false, messages: [this.i18n.translate('ws.games.roomInactive', lang)] });

    await client.join(room_id);
    client.data.room_id = room_id;

    // Check if player is eliminated in an active game
    const game = await this.dominoModel.findOne({ room_id });
    const isMember = room.players.some((p: any) => p.playerId.toString() === player_id);
    const isEliminated = game?.eliminated_players?.includes(player_id);
    client.data.isSpectator = !isMember || isEliminated;

    if (client.data.isSpectator) {
      this.logger.log(`[Domino] 👀 User joined as SPECTATOR | room=${room_id} | player=${player_id} | isMember=${isMember}`);
      if (game) {
        const currentTurnPlayerId = game.player_ids[game.current_player_index]?.toString();
        const turnUsername = await this.getCachedUsername(currentTurnPlayerId);
        const handCount = Object.fromEntries(Array.from(game.hands.entries()).map(([id, h]) => [id, h.length]));
        
        const playersData: any = {};
        for (let i = 0; i < room.players.length; i++) {
          playersData[`player${i + 1}`] = await this.getCachedUsername(room.players[i].playerId.toString());
        }

        client.emit('domino', {
          success: true, messages: [], data: {
            board: game.board, hand: [],
            boneyardCount: game.boneyard.length,
            yourTurn: false, turnTimerSeconds: 30,
            currentTurnUsername: turnUsername,
            waitingForOpponent: false, gameStarted: true,
            isSpectator: true, youWon: false,
            spectatorsCount: room.spectators.length,
            handCount,
            ...playersData,
            shotFrom: turnUsername,
            turnOf: turnUsername,
            history: room.players.flatMap((p, i) => p.moves.map(m => ({ ...m.data, player: playersData[`player${i + 1}`] })))
          }
        });
        client.to(room_id).emit('domino', { success: true, data: { spectatorsCount: room.spectators.length }, messages: [] });
        return;
      } else {
        return client.emit('domino', { success: false, messages: [this.i18n.translate('ws.games.gameNotFound', lang)] });
      }
    }

    const playerIndex = room.players.findIndex((p: any) => p.playerId.toString() === player_id);
    client.data.playerNum = playerIndex + 1;

    if (room.status === 'started' && game) {
      const currentTurnPlayerId = game.player_ids[game.current_player_index]?.toString();
      const isMyTurn = currentTurnPlayerId === player_id;
      const turnUsername = await this.getCachedUsername(currentTurnPlayerId);
      const handCount = Object.fromEntries(Array.from(game.hands.entries()).map(([id, h]) => [id, h.length]));

      const playersData: any = {};
      for (let i = 0; i < room.players.length; i++) {
        playersData[`player${i + 1}`] = await this.getCachedUsername(room.players[i].playerId.toString());
      }

      // Phase B: compute the actual remaining turn time and arm a fresh server-side
      // timer for the reconnecting player if it's their turn. Previously the client
      // always saw `turnTimerSeconds: 30`, hiding how much real time was left, and
      // the in-process turn timeout died when the original socket dropped.
      const totalTimerSeconds = (room.game_id as any)?.turn_timer_seconds || 30;
      const elapsed = game.turn_start_time
        ? Math.floor((Date.now() - game.turn_start_time.getTime()) / 1000)
        : 0;
      const remaining = Math.max(5, totalTimerSeconds - elapsed);
      if (isMyTurn) {
        this.startTimer(client, room_id, remaining);
      }

      this.logger.log(`[Domino] 🏠 Re-joined STARTED game | room=${room_id} | player=${player_id} | asSpectator=${client.data.isSpectator}`);

      return client.emit('domino', {
        success: true, messages: [], data: {
          board: game.board, hand: game.hands.get(player_id) || [],
          boneyardCount: game.boneyard.length,
          yourTurn: isMyTurn, turnTimerSeconds: remaining,
          currentTurnUsername: turnUsername,
          waitingForOpponent: false, gameStarted: true, youWon: false, isSpectator: false,
          handCount,
          ...playersData,
          shotFrom: turnUsername,
          turnOf: turnUsername,
          history: room.players.flatMap((p, i) => p.moves.map(m => ({ ...m.data, player: playersData[`player${i + 1}`] })))
        }
      });
    }

    const maxPlayers = room.player_limit || room.game_id?.max_players || 2;
    const socketsInRoom = await this.server.in(room_id).fetchSockets();

    client.emit('domino', {
      success: true,
      data: { waitingForOpponent: true, isPlayerOne: playerIndex === 0, playersJoined: socketsInRoom.length, maxPlayers, isSpectator: false },
      messages: [this.i18n.translate('ws.games.waitingOpponent', lang)]
    });

    if (socketsInRoom.length > 1 && room.status === 'waiting' && socketsInRoom.length < maxPlayers) {
      const username = await this.getCachedUsername(player_id);
      client.to(room_id).emit('domino', {
        success: true,
        data: { opponentJoined: true, opponentName: username, waitingForOpponent: true, playersJoined: socketsInRoom.length, maxPlayers },
        messages: [this.i18n.translate('ws.games.opponentJoined', lang, { username })]
      });
    }

    if (socketsInRoom.length >= maxPlayers && room.status === 'waiting') {
      // Phase A hardening: gate on DB players, not just socket count.
      if (room.players.length < maxPlayers) return;

      const started = await this.roomModel.findOneAndUpdate({ _id: room_id, status: 'waiting' }, { $set: { status: 'started' } }, { returnDocument: 'after' });
      if (!started) return;

      const playerIds = room.players.map((p: any) => p.playerId);
      const paid: Types.ObjectId[] = [];

      // Phase A: single compensating action for any post-deduction failure (deal,
      // domino.create, etc.). Previously a thrown create would silently lose every
      // player's stake.
      const compensate = async (errKey: string, reason: string) => {
        this.logger.error(`event=domino_start_failed room=${room_id} reason=${reason}`);
        for (const pid of paid) {
          await this.userModel
            .updateOne({ _id: pid }, { $inc: { balance: room.bet_amount } })
            .catch((e) => this.logger.error(`[Domino] Refund failed | player=${pid}`, e));
        }
        await this.dominoModel
          .deleteOne({ room_id: new Types.ObjectId(room_id) })
          .catch((e) => this.logger.error(`[Domino] Game cleanup failed | room=${room_id}`, e));
        await this.roomModel
          .findByIdAndUpdate(room_id, { $set: { status: 'waiting' } })
          .catch((e) => this.logger.error(`[Domino] Room status reset failed | room=${room_id}`, e));
        this.server
          .to(room_id)
          .emit('domino', { success: false, messages: [this.i18n.translate(errKey, lang)] });
      };

      let allPaid = true;
      for (const pid of playerIds) {
        const deducted = await this.userModel.findOneAndUpdate({ _id: pid, balance: { $gte: room.bet_amount } }, { $inc: { balance: -room.bet_amount } });
        if (!deducted) { allPaid = false; break; }
        paid.push(pid);
      }
      if (!allPaid) {
        await compensate('ws.games.insufficientBalance', 'insufficient_balance');
        return;
      }

      let hands: Map<string, any>;
      let boneyard: any[];
      let startIdx: number;
      try {
        const dealt = deal(playerIds.map((p: any) => p.toString()));
        hands = dealt.hands;
        boneyard = dealt.boneyard;
        startIdx = getStartingPlayerIndex(playerIds.map((p: any) => p.toString()), hands);
      } catch (e) {
        this.logger.error(`[Domino] Deal failed | room=${room_id}`, e);
        await compensate('ws.games.matchmakingError', 'deal_failed');
        return;
      }

      const handsRecord: Record<string, any> = {};
      hands.forEach((v, k) => { handsRecord[k] = v; });
      try {
        await this.dominoModel.create({ room_id, player_ids: playerIds, hands: handsRecord, boneyard, current_player_index: startIdx, turn_start_time: new Date() });
      } catch (e) {
        this.logger.error(`[Domino] Game create failed | room=${room_id}`, e);
        await compensate('ws.games.matchmakingError', 'game_create_failed');
        return;
      }

      const timerSec = room.game_id?.turn_timer_seconds ?? 30;
      const startingPlayerId = playerIds[startIdx].toString();
      const startingUsername = await this.getCachedUsername(startingPlayerId);
      for (const s of socketsInRoom) {
        const pid = (s as any).data.player_id;
        const sIsSpectator = (s as any).data.isSpectator || false;
        const myHand = sIsSpectator ? [] : (hands.get(pid) || []);
        const isMyTurn = sIsSpectator ? false : startingPlayerId === pid;
        const sLang = this.getLang(s as unknown as Socket);
        (s as unknown as Socket).emit('domino', { success: true, data: { hand: myHand, board: [], boneyardCount: boneyard.length, yourTurn: isMyTurn, turnTimerSeconds: timerSec, currentTurnUsername: startingUsername, gameStarted: true, isSpectator: sIsSpectator }, messages: sIsSpectator ? [this.i18n.translate('ws.games.gameStarted', sLang)] : [isMyTurn ? this.i18n.translate('ws.games.yourTurn', sLang) : this.i18n.translate('ws.games.gameStarted', sLang)] });
        if (isMyTurn) this.startTimer(s as unknown as Socket, room_id, timerSec);
      }
      const gId = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
      const populated = await this.roomModel.findById(room_id).populate('game_id', '-created_at').populate('players.playerId', 'username').lean();
      if (gId) this.roomsGateway.broadcastRoomUpdate(gId, 'roomUpdated', populated);
    }
  }

  @SubscribeMessage('move')
  async handleMove(@ConnectedSocket() client: Socket, @MessageBody() payload: { room_id: string; tile: number[]; side: 'left' | 'right' }) {
    const lang = this.getLang(client);
    if (client.data.isSpectator) return client.emit('domino', { success: false, messages: [this.i18n.translate('ws.games.spectatorActionDenied', lang)] });
    const room_id = payload.room_id || client.data.room_id;
    const { tile, side } = payload;
    const player_id = client.data.player_id;
    if (!room_id || !tile || !side) {
      this.logger.warn(`[Domino] ❌ Invalid move payload | player=${player_id} | payload=${JSON.stringify(payload)} | socketRoom=${client.data.room_id}`);
      return client.emit('domino', { success: false, messages: [this.i18n.translate('ws.games.invalidMove', lang)] });
    }

    await this.runWithRetry(async () => {
      const game = await this.dominoModel.findOne({ room_id: new Types.ObjectId(room_id) });
      if (!game) throw new Error('Game not found');
      if (game.player_ids[game.current_player_index]?.toString() !== player_id) throw new Error('Not your turn');

      const { valid, flippedTile } = validateMove(tile as [number, number], side, game.open_ends || {});
      if (!valid) {
        this.logger.warn(`[Domino] ❌ Invalid move (validation failed) | player=${player_id} | tile=${JSON.stringify(tile)} | side=${side} | open_ends=${JSON.stringify(game.open_ends)}`);
        client.emit('domino', { success: false, messages: [this.i18n.translate('ws.games.invalidMove', lang)] });
        return;
      }

      const hand = game.hands.get(player_id) || [];
      const t0 = Number(tile[0]), t1 = Number(tile[1]);
      const tileIdx = hand.findIndex(([v1, v2]) => (v1 === t0 && v2 === t1) || (v1 === t1 && v2 === t0));

      if (tileIdx === -1) {
        this.logger.warn(`[Domino] ❌ Invalid move (tile not in hand) | player=${player_id} | tile=${JSON.stringify(tile)} | hand=${JSON.stringify(hand)}`);
        client.emit('domino', { success: false, messages: [this.i18n.translate('ws.games.invalidMove', lang)] });
        return;
      }

      // Record move in room
      await this.roomModel.updateOne(
        { _id: new Types.ObjectId(room_id), 'players.playerId': new Types.ObjectId(player_id) },
        { $push: { 'players.$.moves': { data: { tile, side, type: 'move' } } } }
      );

      // Immutable state updates
      const newHand = hand.filter((_, i) => i !== tileIdx);
      game.hands.set(player_id, newHand);

      if (side === 'left') {
        game.board = [flippedTile, ...game.board];
        game.open_ends = { left: flippedTile[0], right: game.board.length === 1 ? flippedTile[1] : game.open_ends?.right };
      } else {
        game.board = [...game.board, flippedTile];
        game.open_ends = { right: flippedTile[1], left: game.board.length === 1 ? flippedTile[0] : game.open_ends?.left };
      }

      game.consecutive_passes = 0;
      const playerIdsStr = game.player_ids.map((p: any) => p.toString());
      const eliminated = game.eliminated_players || [];
      game.current_player_index = getNextActivePlayerIndex(game.current_player_index, playerIdsStr, eliminated);
      game.turn_start_time = new Date();

      const handsObj = Object.fromEntries(game.hands);
      const result = getDominoGameResult(new Map(Object.entries(handsObj)) as Map<string, any>, game.consecutive_passes, playerIdsStr, eliminated);

      const room = await this.roomModel.findById(room_id);
      if (result.finished && room) {
        room.status = 'finished'; room.winner_reason = result.reason; room.finished_at = new Date();
        if (result.winner) {
          room.winner = new Types.ObjectId(result.winner);
          const grossPayout = winnerGrossPayout(
            room.bet_amount,
            room.house_edge,
            room.players.length,
          );
          await this.userModel.updateOne({ _id: result.winner }, { $inc: { balance: grossPayout } });
        }
        await room.save();
        const gameId = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
        if (gameId) this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
      }

      game.markModified('hands');
      game.markModified('board');
      game.markModified('open_ends');
      await game.save();

      this.logger.log(`[Domino] ✅ Move SUCCESS | player=${player_id} | tile=${JSON.stringify(tile)} | boardLen=${game.board.length} | ends=${JSON.stringify(game.open_ends)} | tilesRemaining=${newHand.length}`);

      const handCount = Object.fromEntries(Array.from(game.hands.entries()).map(([id, h]) => [id, h.length]));
      const sockets = await this.server.in(room_id).fetchSockets();
      const nextPlayerId = game.player_ids[game.current_player_index].toString();
      const nextUsername = await this.getCachedUsername(nextPlayerId);
      const timerSec = 30;

      clearTimer(client.id);
      const nextPlayerSocket = sockets.find(s => (s as any).data.player_id === nextPlayerId);
      if (!result.finished && nextPlayerSocket) this.startTimer(nextPlayerSocket as unknown as Socket, room_id, timerSec);

      const shotFrom = await this.getCachedUsername(player_id);

      for (const s of sockets) {
        const pid = (s as any).data.player_id;
        const sIsSpectator = (s as any).data.isSpectator || false;
        const sLang = this.getLang(s as unknown as Socket);
        const myHand = sIsSpectator ? [] : (game.hands.get(pid) || []);
        const isMyTurn = !sIsSpectator && pid === nextPlayerId;
        const isWinner = !sIsSpectator && result.winner === pid;
        const outcome = isWinner ? 'win' : (result.finished && result.winner ? 'lose' : (result.finished ? 'draw' : ''));
        const prize =
          isWinner && room
            ? winnerDisplayedPrize(room.bet_amount, room.house_edge, room.players.length)
            : 0;

        const sData: any = { board: game.board, hand: myHand, boneyardCount: game.boneyard.length, lastTile: flippedTile, lastSide: side, lastPlayer: player_id, gameEnded: result.finished, outcome, youWon: isWinner, winner: result.winner, reason: result.reason, prize, yourTurn: isMyTurn, turnTimerSeconds: timerSec, currentTurnUsername: nextUsername, handCount, isSpectator: sIsSpectator };
        if (sIsSpectator) { sData.shotFrom = shotFrom; sData.turnOf = nextUsername; if (result.finished && result.winner) sData.winner = result.winner ? await this.getCachedUsername(result.winner) : null; }

        let msg = '';
        if (result.finished) msg = isWinner ? this.i18n.translate('ws.games.youWin', sLang) : this.i18n.translate('ws.games.gameOver', sLang);
        else msg = isMyTurn ? this.i18n.translate('ws.domino.yourTurn', sLang) : this.i18n.translate('ws.domino.waitingForOther', sLang, { username: nextUsername });

        (s as unknown as Socket).emit('domino', { success: true, data: sData, messages: [msg] });
      }
    });
  }

  @SubscribeMessage('draw')
  async handleDraw(@ConnectedSocket() client: Socket, @MessageBody() payload: { room_id: string }) {
    const lang = this.getLang(client);
    const room_id = payload.room_id || client.data.room_id;
    if (!room_id) return client.emit('domino', { success: false, messages: [this.i18n.translate('ws.games.invalidMove', lang)] });
    const player_id = client.data.player_id;

    await this.runWithRetry(async () => {
      const game = await this.dominoModel.findOne({ room_id: new Types.ObjectId(room_id) });
      if (!game) throw new Error('Game not found');
      if (game.player_ids[game.current_player_index]?.toString() !== player_id) throw new Error('Not your turn');
      if (game.boneyard.length === 0) {
        client.emit('domino', { success: false, messages: [this.i18n.translate('ws.domino.boneyardEmpty', lang)] });
        return;
      }

      const currentBoneyard = [...game.boneyard];
      const drawn = currentBoneyard.pop();
      if (!drawn) throw new Error('Boneyard unexpectedly empty');

      const hand = game.hands.get(player_id) || [];
      const newHand = [...hand, drawn as [number, number]];
      game.hands.set(player_id, newHand);
      game.boneyard = currentBoneyard;

      game.markModified('hands');
      game.markModified('boneyard');
      await game.save();

      this.logger.log(`[Domino] 🁣 Draw SUCCESS | player=${player_id} | drawn=${JSON.stringify(drawn)} | boneyardLeft=${game.boneyard.length} | handSize=${newHand.length}`);

      const handCount = Object.fromEntries(Array.from(game.hands.entries()).map(([id, h]) => [id, h.length]));
      const sockets = await this.server.in(room_id).fetchSockets();
      const timerSec = 30;
      clearTimer(client.id);
      const nextPlayerSocket = sockets.find(s => (s as any).data.player_id === player_id);
      if (nextPlayerSocket) this.startTimer(nextPlayerSocket as unknown as Socket, room_id, timerSec);

      const turnUsername = await this.getCachedUsername(player_id);

      for (const s of sockets) {
        const pid = (s as any).data.player_id;
        const sIsSpectator = (s as any).data.isSpectator || false;
        const sLang = this.getLang(s as unknown as Socket);
        const myHand = sIsSpectator ? [] : (game.hands.get(pid) || []);
        const isDrawingPlayer = !sIsSpectator && pid === player_id;

        const sData: any = { board: game.board, hand: myHand, boneyardCount: game.boneyard.length, lastTile: null, lastSide: null, lastPlayer: player_id, yourTurn: isDrawingPlayer, turnTimerSeconds: timerSec, currentTurnUsername: turnUsername, handCount, isSpectator: sIsSpectator };
        if (sIsSpectator) { sData.shotFrom = turnUsername; sData.turnOf = turnUsername; }

        const msg = isDrawingPlayer ? this.i18n.translate('ws.domino.drewTile', sLang) : this.i18n.translate('ws.domino.opponentDrew', sLang, { username: turnUsername });
        (s as unknown as Socket).emit('domino', { success: true, data: sData, messages: [msg] });
      }
    });
  }

  @SubscribeMessage('pass')
  async handlePass(@ConnectedSocket() client: Socket, @MessageBody() payload: { room_id: string }) {
    const lang = this.getLang(client);
    const room_id = payload.room_id || client.data.room_id;
    if (!room_id) return client.emit('domino', { success: false, messages: [this.i18n.translate('ws.games.invalidMove', lang)] });
    const player_id = client.data.player_id;

    await this.runWithRetry(async () => {
      const game = await this.dominoModel.findOne({ room_id: new Types.ObjectId(room_id) });
      if (!game) throw new Error('Game not found');
      if (game.player_ids[game.current_player_index]?.toString() !== player_id) throw new Error('Not your turn');

      game.consecutive_passes++;
      const playerIdsStr = game.player_ids.map((p: any) => p.toString());
      const eliminated = game.eliminated_players || [];
      game.current_player_index = getNextActivePlayerIndex(game.current_player_index, playerIdsStr, eliminated);
      game.turn_start_time = new Date();

      const handsObj = Object.fromEntries(game.hands);
      const result = getDominoGameResult(new Map(Object.entries(handsObj)) as Map<string, any>, game.consecutive_passes, playerIdsStr, eliminated);

      const room = await this.roomModel.findById(room_id);
      if (result.finished && room) {
        room.status = 'finished'; room.winner_reason = result.reason; room.finished_at = new Date();
        if (result.winner) {
          room.winner = new Types.ObjectId(result.winner);
          const grossPayout = winnerGrossPayout(
            room.bet_amount,
            room.house_edge,
            room.players.length,
          );
          await this.userModel.updateOne({ _id: result.winner }, { $inc: { balance: grossPayout } });
        }
        await room.save();
        const gameId = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
        if (gameId) this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
      }

      game.markModified('consecutive_passes');
      await game.save();

      this.logger.log(`[Domino] ⏩ Pass SUCCESS | player=${player_id} | consecutivePasses=${game.consecutive_passes}`);

      const handCount = Object.fromEntries(Array.from(game.hands.entries()).map(([id, h]) => [id, h.length]));
      const sockets = await this.server.in(room_id).fetchSockets();
      const nextPlayerId = game.player_ids[game.current_player_index].toString();
      const nextUsername = await this.getCachedUsername(nextPlayerId);
      const timerSec = 30;

      clearTimer(client.id);
      const nextPlayerSocket = sockets.find(s => (s as any).data.player_id === nextPlayerId);
      if (!result.finished && nextPlayerSocket) this.startTimer(nextPlayerSocket as unknown as Socket, room_id, timerSec);

      const shotFrom = await this.getCachedUsername(player_id);

      for (const s of sockets) {
        const pid = (s as any).data.player_id;
        const sIsSpectator = (s as any).data.isSpectator || false;
        const sLang = this.getLang(s as unknown as Socket);
        const myHand = sIsSpectator ? [] : (game.hands.get(pid) || []);
        const sIsMyTurn = !sIsSpectator && pid === nextPlayerId;
        const isWinner = !sIsSpectator && result.winner === pid;
        const outcome = isWinner ? 'win' : (result.finished && result.winner ? 'lose' : (result.finished ? 'draw' : ''));
        const prize =
          isWinner && room
            ? winnerDisplayedPrize(room.bet_amount, room.house_edge, room.players.length)
            : 0;

        const sData: any = { board: game.board, hand: myHand, boneyardCount: game.boneyard.length, lastTile: null, lastSide: null, lastPlayer: player_id, passed: true, gameEnded: result.finished, outcome, youWon: isWinner, winner: result.winner, reason: result.reason, prize, yourTurn: sIsMyTurn, turnTimerSeconds: timerSec, currentTurnUsername: nextUsername, handCount, isSpectator: sIsSpectator };
        if (sIsSpectator) { sData.shotFrom = shotFrom; sData.turnOf = nextUsername; if (result.finished && result.winner) sData.winner = result.winner ? await this.getCachedUsername(result.winner) : null; }

        let msg = '';
        if (result.finished) msg = this.i18n.translate('ws.games.gameOver', sLang);
        else msg = sIsMyTurn ? this.i18n.translate('ws.domino.opponentPassed', sLang, { username: shotFrom }) : (pid === player_id ? this.i18n.translate('ws.domino.passed', sLang) : this.i18n.translate('ws.domino.opponentPassed', sLang, { username: shotFrom }));

        (s as unknown as Socket).emit('domino', { success: true, data: sData, messages: [msg] });
      }
    });
  }

  private startTimer(socket: Socket, room_id: string, seconds: number) {
    const player_id = (socket as any).data?.player_id;
    if (!player_id) return;

    clearTimer(socket.id);
    const t = setTimeout(async () => {
      // Re-verify if player is still in turn via DB to be safe
      const game = await this.dominoModel.findOne({ room_id: new Types.ObjectId(room_id) });
      if (!game || game.status !== 'active') return;
      const currentPlayerId = game.player_ids[game.current_player_index]?.toString();
      if (currentPlayerId !== player_id) return;

      const lang = this.getLang(socket);
      socket.emit('domino', { success: true, data: { gameEnded: true, outcome: 'timeout_loss', youWon: false, reason: 'timeout', isSpectator: false }, messages: [this.i18n.translate('ws.domino.timeout', lang)] });
      socket.data.eliminationReason = 'timeout';
      
      // Permanently eliminate
      await this.eliminatePlayer(room_id, player_id, 'timeout');
      
      socket.leave(room_id);
      socket.disconnect(true);
    }, seconds * 1000);
    turnTimers.set(socket.id, t);
  }

  public async eliminatePlayer(room_id: string, player_id: string, reason: 'forfeit' | 'timeout') {
    await this.runWithRetry(async () => {
      // Clear reconnection session
      await this.redis.del(`grace_period:domino:${player_id}`);
      
      const game = await this.dominoModel.findOne({ room_id: new Types.ObjectId(room_id) });
      if (!game) return;
      const room = await this.roomModel.findById(room_id);
      if (!room || room.status !== 'started') return;

      const playerIdsStr = game.player_ids.map((p: any) => p.toString());
      const eliminated = game.eliminated_players || [];
      if (eliminated.includes(player_id)) return;

      const hand = game.hands.get(player_id) || [];
      if (hand.length > 0) {
        this.logger.log(`[Domino] 🔄 Returning tiles to boneyard | player=${player_id} | tiles=${JSON.stringify(hand)}`);
        game.boneyard = [...game.boneyard, ...hand];
        game.hands.set(player_id, []);
      }
      
      this.logger.log(`[Domino] 🚪 ELIMINATING player | player=${player_id} | reason=${reason} | remainingActive=${playerIdsStr.filter(id => !eliminated.includes(id) && id !== player_id).length}`);
      
      const newEliminated = [...eliminated, player_id];
      game.eliminated_players = newEliminated;

      const currentPlayerId = playerIdsStr[game.current_player_index];
      if (currentPlayerId === player_id) {
        game.current_player_index = getNextActivePlayerIndex(game.current_player_index, playerIdsStr, newEliminated);
        game.turn_start_time = new Date();
      }
      game.consecutive_passes = 0;

      const handsObj = Object.fromEntries(game.hands);
      const result = getDominoGameResult(new Map(Object.entries(handsObj)) as Map<string, any>, game.consecutive_passes, playerIdsStr, newEliminated);

      if (result.finished) {
        room.status = 'finished'; room.winner_reason = result.reason || reason; room.finished_at = new Date();
        if (result.winner) {
          room.winner = new Types.ObjectId(result.winner);
          const grossPayout = winnerGrossPayout(
            room.bet_amount,
            room.house_edge,
            room.players.length,
          );
          await this.userModel.updateOne({ _id: result.winner }, { $inc: { balance: grossPayout } });
        }
        await room.save();
        const gameId = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
        if (gameId) this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
      }

      game.markModified("hands");
      game.markModified("boneyard");
      game.markModified("eliminated_players");
      await game.save();

      const sockets = await this.server.in(room_id).fetchSockets();
      const nextPlayerId = playerIdsStr[game.current_player_index];
      const nextUsername = await this.getCachedUsername(nextPlayerId);
      const eliminatedUsername = await this.getCachedUsername(player_id);
      const timerSec = 30;
      const handCount = Object.fromEntries(Array.from(game.hands.entries()).map(([id, h]) => [id, h.length]));

      if (!result.finished) {
        const nextPlayerSocket = sockets.find(s => (s as any).data.player_id === nextPlayerId);
        if (nextPlayerSocket) this.startTimer(nextPlayerSocket as unknown as Socket, room_id, timerSec);
      }

      for (const s of sockets) {
        const pid = (s as any).data.player_id;
        const sIsSpectator = (s as any).data.isSpectator || false;
        const sLang = this.getLang(s as unknown as Socket);
        const myHand = sIsSpectator ? [] : (game.hands.get(pid) || []);
        const sIsMyTurn = !sIsSpectator && pid === nextPlayerId;
        const isWinner = !sIsSpectator && result.winner === pid;
        const outcome = isWinner ? 'win' : (result.finished && result.winner ? 'lose' : (result.finished ? 'draw' : ''));
        const prize =
          isWinner && room
            ? winnerDisplayedPrize(room.bet_amount, room.house_edge, room.players.length)
            : 0;

        const sData: any = { board: game.board, hand: myHand, boneyardCount: game.boneyard.length, yourTurn: !result.finished && sIsMyTurn, turnTimerSeconds: timerSec, currentTurnUsername: nextUsername, playerEliminated: eliminatedUsername, eliminationReason: reason, gameEnded: result.finished, outcome, youWon: isWinner, winner: result.winner, reason: result.reason || reason, prize, handCount, isSpectator: sIsSpectator };
        if (sIsSpectator) { sData.shotFrom = eliminatedUsername; sData.turnOf = nextUsername; if (result.finished && result.winner) sData.winner = result.winner ? await this.getCachedUsername(result.winner) : null; }

        let msg = '';
        if (result.finished) msg = isWinner ? this.i18n.translate('ws.domino.youWinElimination', sLang) : this.i18n.translate('ws.games.gameOver', sLang);
        else msg = this.i18n.translate('ws.domino.playerEliminated', sLang, { username: eliminatedUsername });

        (s as unknown as Socket).emit('domino', { success: true, data: sData, messages: [msg] });
      }
    });
  }
}
