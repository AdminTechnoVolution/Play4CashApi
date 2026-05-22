import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
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
import { ConnectFourGame, ConnectFourGameDocument } from './schemas/connect-four-game.schema';
import { I18nService } from '../../../common/i18n/i18n.service';
import { winnerGrossPayout, winnerDisplayedPrize } from '../../../common/utils/game-prize.util';
import {
  colorForPlayerNum,
  createEmptyBoard,
  dropDisc,
  playerNumForColor,
  type ConnectFourBoard,
  type ConnectFourColor,
} from './connect-four-game.logic';

const EVENT = 'connect-four';
const turnTimers = new Map<string, ReturnType<typeof setTimeout>>();
const clearTimer = (id: string) => {
  const t = turnTimers.get(id);
  if (t) {
    clearTimeout(t);
    turnTimers.delete(id);
  }
};

@WebSocketGateway({ namespace: '/connect-four', cors: { origin: '*', credentials: true } })
export class ConnectFourGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(ConnectFourGateway.name);
  private usernameCache = new Map<string, string>();

  constructor(
    @InjectModel(ConnectFourGame.name) private readonly gameModel: Model<ConnectFourGameDocument>,
    @InjectModel('Room') private readonly roomModel: Model<any>,
    @InjectModel('User') private readonly userModel: Model<any>,
    private readonly config: ConfigService,
    private readonly roomsGateway: RoomsGateway,
    @Inject(REDIS_CLIENT) private readonly redis: any,
    private readonly i18n: I18nService,
    private readonly grace: GracePeriodService,
  ) {}

  onModuleInit() {
    this.grace.registerHandler('connect-four', (playerId, roomId) =>
      this.executeForfeit(roomId, playerId),
    );
  }

  afterInit(server: Server) {
    applyWsAuth(server, this.config, this.redis);
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

  private emit(client: Socket, success: boolean, data: Record<string, unknown>, messages: string[]) {
    client.emit(EVENT, { success, data, messages });
  }

  private async buildPublicState(
    room: any,
    game: ConnectFourGameDocument | null,
    viewerPlayerNum: number | null,
    viewerIsSpectator: boolean,
  ): Promise<Record<string, unknown>> {
    const p1Id = room.players[0]?.playerId?.toString();
    const p2Id = room.players[1]?.playerId?.toString();
    const player1 = p1Id ? await this.getCachedUsername(p1Id) : 'Unknown';
    const player2 = p2Id ? await this.getCachedUsername(p2Id) : 'Unknown';
    const board = game?.board ?? createEmptyBoard();
    const currentPlayer = game?.current_player ?? 1;
    const currentTurnUserId =
      currentPlayer === 1 ? p1Id ?? null : p2Id ?? null;

    let winnerUserId: string | null = null;
    if (room.status === 'finished' && room.winner) {
      winnerUserId = room.winner.toString();
    }

    const totalTimer = room.game_id?.turn_timer_seconds ?? 30;
    let turnTimerSeconds = totalTimer;
    if (game?.turn_start_time && room.status === 'started') {
      const elapsed = (Date.now() - game.turn_start_time.getTime()) / 1000;
      turnTimerSeconds = Math.max(5, Math.ceil(totalTimer - elapsed));
    }

    const yourColor: ConnectFourColor | null =
      viewerPlayerNum === 1 ? 'R' : viewerPlayerNum === 2 ? 'Y' : null;

    return {
      roomId: room._id.toString(),
      status: room.status,
      board,
      players: [
        { userId: p1Id, username: player1, color: 'R', connected: true },
        { userId: p2Id, username: player2, color: 'Y', connected: true },
      ],
      currentTurnUserId,
      currentPlayer,
      winnerUserId,
      winningCells: game?.winning_cells ?? [],
      isDraw: room.status === 'finished' && !room.winner && room.winner_reason === 'draw',
      yourColor,
      yourTurn:
        !viewerIsSpectator &&
        viewerPlayerNum === currentPlayer &&
        room.status === 'started',
      turnTimerSeconds,
      gameStarted: room.status === 'started' || room.status === 'finished',
      isSpectator: viewerIsSpectator,
      player1,
      player2,
      winnerReason: room.winner_reason ?? null,
    };
  }

  handleConnection(client: Socket) {
    this.logger.log(`[ConnectFour] Connected: ${client.id}`);
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
      client.to(room_id).emit(EVENT, {
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
      const gameIdForLobby = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
      if (updated.players.length === 0) {
        await this.roomModel.findOneAndDelete({ _id: room_id, players: { $size: 0 } });
        if (gameIdForLobby) {
          this.roomsGateway.broadcastRoomUpdate(gameIdForLobby, 'roomDeleted', { id: room_id });
        }
      } else {
        const sLang = this.getLang(client);
        client.to(room_id).emit(EVENT, {
          success: true,
          messages: [this.i18n.translate('ws.games.opponentLeft', sLang)],
          data: { opponentLeft: true, waitingForOpponent: true },
        });
        if (gameIdForLobby) {
          const populated = await this.roomModel
            .findById(roomObjId)
            .populate('game_id', '-created_at')
            .populate('players.playerId', 'username')
            .lean();
          if (populated) {
            this.roomsGateway.broadcastRoomUpdate(gameIdForLobby, 'roomUpdated', populated);
          }
        }
      }
      return;
    }

    if (room.status === 'started') {
      const game = await this.gameModel.findOne({ room_id: roomObjId });
      let remainingTurnSecs = 0;
      if (game && game.current_player) {
        const currentId =
          game.current_player === 1 ? game.player1_id : game.player2_id;
        if (currentId?.toString() === player_id && game.turn_start_time) {
          const limit = (room.game_id?.turn_timer_seconds || 30) * 1000;
          remainingTurnSecs = Math.ceil(
            (limit - (Date.now() - game.turn_start_time.getTime())) / 1000,
          );
        }
      }
      await this.grace.start('connect-four', player_id, room_id, Math.max(60, remainingTurnSecs));
    }
  }

  async executeForfeit(room_id: string, player_id: string) {
    const room = await this.roomModel.findOne({
      _id: new Types.ObjectId(room_id),
      status: 'started',
    });
    if (!room) return;

    const winner_id = room.players.find(
      (p: any) => p.playerId.toString() !== player_id,
    )?.playerId;
    if (!winner_id) return;

    room.status = 'finished';
    room.winner = winner_id;
    room.winner_reason = 'forfeit';
    room.finished_at = new Date();
    await room.save();

    const grossPayout = winnerGrossPayout(room.bet_amount, room.house_edge, room.players.length);
    await this.userModel.findByIdAndUpdate(winner_id, { $inc: { balance: grossPayout } });

    const winnerUsername = await this.getCachedUsername(winner_id.toString());
    const displayPrize = winnerDisplayedPrize(
      room.bet_amount,
      room.house_edge,
      room.players.length,
    );
    const sockets = await this.server.in(room_id).fetchSockets();
    for (const s of sockets) {
      const sIsSpectator = (s as any).data.isSpectator || false;
      const isWinner = (s as any).data.player_id === winner_id.toString();
      const sLang = this.getLang(s as unknown as Socket);
      (s as unknown as Socket).emit(EVENT, {
        success: true,
        data: {
          gameEnded: true,
          outcome: 'forfeit',
          youWon: isWinner && !sIsSpectator,
          winner: sIsSpectator ? winnerUsername : winner_id,
          reason: 'forfeit',
          prize: isWinner ? displayPrize : 0,
          isSpectator: sIsSpectator,
        },
        messages: sIsSpectator
          ? [this.i18n.translate('ws.games.winsForfeit', sLang, { username: winnerUsername })]
          : [
              isWinner
                ? this.i18n.translate('ws.games.win', sLang)
                : this.i18n.translate('ws.games.playerDisconnected', sLang),
            ],
      });
    }
    const gameId = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
    if (gameId) this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
  }

  @SubscribeMessage('join')
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { room_id: string },
  ) {
    const lang = this.getLang(client);
    const player_id = client.data.player_id;
    const room_id = payload?.room_id;
    await this.grace.cancel('connect-four', player_id);

    if (!room_id) {
      return this.emit(client, false, {}, [this.i18n.translate('ws.invalidMessageFormat', lang)]);
    }

    const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds');
    if (!room) {
      return this.emit(client, false, {}, [this.i18n.translate('ws.games.gameNotFound', lang)]);
    }
    if (room.status === 'finished') {
      return this.emit(client, false, {}, [this.i18n.translate('ws.games.roomInactive', lang)]);
    }

    const isMember = room.players.some((p: any) => p.playerId.toString() === player_id);
    const isSpectator = room.spectators?.some((id: any) => id.toString() === player_id);
    if (!isMember && !isSpectator) {
      return this.emit(client, false, {}, [this.i18n.translate('ws.games.notInRoom', lang)]);
    }

    await client.join(room_id);
    client.data.room_id = room_id;
    client.data.isSpectator = !isMember;

    const game = await this.gameModel.findOne({ room_id: new Types.ObjectId(room_id) });
    const playerIndex = room.players.findIndex((p: any) => p.playerId.toString() === player_id);
    const playerNum = playerIndex === 0 ? 1 : playerIndex === 1 ? 2 : 0;
    if (playerNum) client.data.playerNum = playerNum;

    const state = await this.buildPublicState(
      room,
      game,
      client.data.isSpectator ? null : playerNum,
      client.data.isSpectator,
    );

    if (room.status === 'started' && game && !client.data.isSpectator) {
      const isMyTurn = game.current_player === playerNum;
      if (isMyTurn) {
        const timerSeconds = state.turnTimerSeconds as number;
        this.startTimer(client, room_id, timerSeconds);
      }
      return this.emit(client, true, { ...state, waitingForOpponent: false }, []);
    }

    if (room.status === 'started' && game && client.data.isSpectator) {
      return this.emit(client, true, state, []);
    }

    this.emit(client, true, { ...state, waitingForOpponent: true }, [
      this.i18n.translate('ws.games.waitingOpponent', lang),
    ]);

    const socketsInRoom = await this.server.in(room_id).fetchSockets();
    if (socketsInRoom.length > 1) {
      const username = await this.getCachedUsername(player_id);
      client.to(room_id).emit(EVENT, {
        success: true,
        messages: [this.i18n.translate('ws.games.opponentJoined', lang, { username })],
        data: { opponentJoined: true, opponentName: username },
      });
    }

    if (socketsInRoom.length >= 2 && room.status === 'waiting') {
      if (room.players.length < 2 || !room.players[0]?.playerId || !room.players[1]?.playerId) {
        return;
      }
      const started = await this.roomModel.findOneAndUpdate(
        { _id: room_id, status: 'waiting' },
        { $set: { status: 'started', turn_start_time: new Date() } },
        { returnDocument: 'after' },
      );
      if (!started) return;

      const [p1id, p2id] = [room.players[0].playerId, room.players[1].playerId];
      const paid: Types.ObjectId[] = [];

      const compensate = async (errKey: string, reason: string) => {
        this.logger.error(`event=connect_four_start_failed room=${room_id} reason=${reason}`);
        for (const pid of paid) {
          await this.userModel
            .updateOne({ _id: pid }, { $inc: { balance: room.bet_amount } })
            .catch((e) => this.logger.error(`[ConnectFour] Refund failed | player=${pid}`, e));
        }
        await this.gameModel.deleteOne({ room_id: new Types.ObjectId(room_id) }).catch(() => {});
        await this.roomModel.findByIdAndUpdate(room_id, { $set: { status: 'waiting' } });
        this.server.to(room_id).emit(EVENT, {
          success: false,
          messages: [this.i18n.translate(errKey, lang)],
        });
      };

      const deduct1 = await this.userModel.findOneAndUpdate(
        { _id: p1id, balance: { $gte: room.bet_amount } },
        { $inc: { balance: -room.bet_amount } },
        { returnDocument: 'after' },
      );
      if (!deduct1) {
        await compensate('ws.games.insufficientBalance', 'p1_insufficient');
        return;
      }
      paid.push(p1id);

      const deduct2 = await this.userModel.findOneAndUpdate(
        { _id: p2id, balance: { $gte: room.bet_amount } },
        { $inc: { balance: -room.bet_amount } },
        { returnDocument: 'after' },
      );
      if (!deduct2) {
        await compensate('ws.games.insufficientBalance', 'p2_insufficient');
        return;
      }
      paid.push(p2id);

      const board = createEmptyBoard();
      try {
        await this.gameModel.create({
          room_id: new Types.ObjectId(room_id),
          player1_id: p1id,
          player2_id: p2id,
          board,
          current_player: 1,
          winning_cells: [],
          turn_start_time: new Date(),
        });
      } catch (e) {
        this.logger.error(`[ConnectFour] Game create failed | room=${room_id}`, e);
        await compensate('ws.games.matchmakingError', 'game_create_failed');
        return;
      }

      const timerSeconds = room.game_id?.turn_timer_seconds ?? 30;
      const freshGame = await this.gameModel.findOne({ room_id: new Types.ObjectId(room_id) });
      const populatedRoom = await this.roomModel.findById(room_id).populate('game_id');

      for (const s of socketsInRoom) {
        const sPNum = (s as any).data.playerNum || 0;
        const sIsSpectator = (s as any).data.isSpectator || false;
        const isFirst = sPNum === 1;
        const sLang = this.getLang(s as unknown as Socket);
        const sState = await this.buildPublicState(
          populatedRoom,
          freshGame,
          sIsSpectator ? null : sPNum,
          sIsSpectator,
        );
        (s as unknown as Socket).emit(EVENT, {
          success: true,
          data: {
            ...sState,
            waitingForOpponent: false,
            gameStarted: true,
          },
          messages: sIsSpectator
            ? [this.i18n.translate('ws.games.gameStarted', sLang)]
            : [
                isFirst
                  ? this.i18n.translate('ws.games.yourTurn', sLang)
                  : this.i18n.translate('ws.games.waitingOpponent', sLang),
              ],
        });
        if (isFirst && !sIsSpectator) {
          this.startTimer(s as unknown as Socket, room_id, timerSeconds);
        }
      }

      const gId = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
      const populated = await this.roomModel
        .findById(room_id)
        .populate('game_id', '-created_at')
        .populate('players.playerId', 'username')
        .lean();
      if (gId) this.roomsGateway.broadcastRoomUpdate(gId, 'roomUpdated', populated);
    }
  }

  @SubscribeMessage('get_state')
  async handleGetState(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { room_id: string },
  ) {
    const lang = this.getLang(client);
    const room_id = payload?.room_id || client.data.room_id;
    if (!room_id) {
      return this.emit(client, false, {}, [this.i18n.translate('ws.invalidMessageFormat', lang)]);
    }

    const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds');
    if (!room) {
      return this.emit(client, false, {}, [this.i18n.translate('ws.games.gameNotFound', lang)]);
    }

    const game = await this.gameModel.findOne({ room_id: new Types.ObjectId(room_id) });
    const playerNum = client.data.playerNum || 0;
    const state = await this.buildPublicState(
      room,
      game,
      client.data.isSpectator ? null : playerNum,
      !!client.data.isSpectator,
    );
    this.emit(client, true, { gameState: state }, []);
  }

  @SubscribeMessage('drop_disc')
  async handleDropDisc(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { room_id?: string; col: number },
  ) {
    const lang = this.getLang(client);
    if (client.data.isSpectator) {
      return this.emit(client, false, {}, [this.i18n.translate('ws.games.spectatorActionDenied', lang)]);
    }

    const room_id = payload?.room_id || client.data.room_id;
    const col = Number(payload?.col);
    const playerNum = client.data.playerNum as 1 | 2;

    if (!room_id || !Number.isInteger(col)) {
      return this.emit(client, false, {}, [this.i18n.translate('ws.games.invalidMove', lang)]);
    }

    const game = await this.gameModel.findOne({ room_id: new Types.ObjectId(room_id) });
    if (!game) {
      return this.emit(client, false, {}, [this.i18n.translate('ws.games.gameNotFound', lang)]);
    }
    if (game.current_player !== playerNum) {
      return this.emit(client, false, {}, [this.i18n.translate('ws.games.notYourTurn', lang)]);
    }

    const color = colorForPlayerNum(playerNum);
    const result = dropDisc(game.board as ConnectFourBoard, col, color);
    if (!result.ok) {
      return this.emit(client, false, { board: game.board, col }, [
        this.i18n.translate('ws.games.invalidMove', lang),
      ]);
    }

    game.board = result.board;
    game.turn_start_time = new Date();
    let finished = false;
    let winnerNum: 1 | 2 | null = null;
    let isDraw = false;

    if (result.win.won) {
      finished = true;
      winnerNum = playerNum;
      game.winning_cells = result.win.winningCells;
    } else if (result.isDraw) {
      finished = true;
      isDraw = true;
    } else {
      game.current_player = playerNum === 1 ? 2 : 1;
    }
    game.markModified('board');
    await game.save();

    const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds');
    if (!room) {
      return this.emit(client, false, {}, [this.i18n.translate('ws.games.gameNotFound', lang)]);
    }

    const limit = room.game_id?.turn_timer_seconds || 30;
    const sockets = await this.server.in(room_id).fetchSockets();
    const opponent = sockets.find((s) => (s as any).data.playerNum === game.current_player);
    clearTimer(client.id);
    if (!finished && opponent) {
      this.startTimer(opponent as unknown as Socket, room_id, limit);
    }

    room.turn_start_time = new Date();
    await room.save();

    if (finished) {
      room.status = 'finished';
      room.finished_at = new Date();
      if (isDraw) {
        room.winner_reason = 'draw';
        room.winner = undefined;
      } else if (winnerNum) {
        room.winner = winnerNum === 1 ? game.player1_id : game.player2_id;
        room.winner_reason = 'win';
        const grossPayout = winnerGrossPayout(
          room.bet_amount,
          room.house_edge,
          room.players.length,
        );
        await this.userModel.updateOne({ _id: room.winner }, { $inc: { balance: grossPayout } });
      }
      await room.save();
      const gameId = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
      if (gameId) this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
    }

    const displayPrize = winnerDisplayedPrize(
      room.bet_amount,
      room.house_edge,
      room.players.length,
    );
    const lastMove = {
      userId: client.data.player_id,
      row: result.row,
      col: result.col,
      color,
      at: new Date().toISOString(),
    };

    for (const s of sockets) {
      const sLang = this.getLang(s as unknown as Socket);
      const sPNum = (s as any).data.playerNum || 0;
      const sIsSpectator = (s as any).data.isSpectator || false;
      const isWinner = finished && !isDraw && winnerNum === sPNum;
      const sState = await this.buildPublicState(room, game, sIsSpectator ? null : sPNum, sIsSpectator);

      let msg = '';
      if (finished) {
        if (isDraw) {
          msg = this.i18n.translate('ws.games.drawGeneric', sLang);
        } else {
          msg = isWinner
            ? this.i18n.translate('ws.games.win', sLang)
            : this.i18n.translate('ws.games.lose', sLang);
        }
      } else if (s.id === client.id) {
        msg = this.i18n.translate('ws.games.moveAccepted', sLang);
      } else {
        msg = this.i18n.translate('ws.games.opponentMoved', sLang);
      }

      (s as unknown as Socket).emit(EVENT, {
        success: true,
        data: {
          ...sState,
          lastMove,
          gameEnded: finished,
          youWon: isWinner && !sIsSpectator,
          outcome: finished ? (isDraw ? 'draw' : isWinner ? 'win' : 'lose') : '',
          prize: isWinner ? displayPrize : 0,
          reason: finished ? (isDraw ? 'draw' : 'win') : undefined,
        },
        messages: [msg],
      });
    }
  }

  @SubscribeMessage('forfeit')
  async handleForfeit(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { room_id?: string },
  ) {
    const lang = this.getLang(client);
    if (client.data.isSpectator) {
      return this.emit(client, false, {}, [this.i18n.translate('ws.games.spectatorActionDenied', lang)]);
    }
    const room_id = payload?.room_id || client.data.room_id;
    const player_id = client.data.player_id;
    if (!room_id || !player_id) {
      return this.emit(client, false, {}, [this.i18n.translate('ws.invalidMessageFormat', lang)]);
    }
    await this.grace.cancel('connect-four', player_id);
    await this.executeForfeit(room_id, player_id);
    this.emit(client, true, { gameEnded: true, outcome: 'forfeit' }, [
      this.i18n.translate('ws.games.lose', lang),
    ]);
  }

  private startTimer(socket: Socket, room_id: string, seconds: number) {
    clearTimer(socket.id);
    const t = setTimeout(async () => {
      const game = await this.gameModel.findOne({ room_id: new Types.ObjectId(room_id) });
      if (!game) return;
      const winnerNum = game.current_player === 1 ? 2 : 1;
      const winnerId = winnerNum === 1 ? game.player1_id : game.player2_id;
      const room = await this.roomModel.findById(room_id);
      if (!room || room.status !== 'started') return;

      room.status = 'finished';
      room.winner = winnerId;
      room.winner_reason = 'timeout';
      room.finished_at = new Date();
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
        (s as unknown as Socket).emit(EVENT, {
          success: true,
          data: {
            gameEnded: true,
            outcome: isWinnerFound ? 'win' : 'timeout_loss',
            youWon: isWinnerFound && !sIsSpectator,
            winner: sIsSpectator ? winnerUsername : winnerId,
            reason: 'timeout',
            prize: isWinnerFound ? displayPrize : 0,
            isSpectator: sIsSpectator,
          },
          messages: sIsSpectator
            ? [this.i18n.translate('ws.games.winsTimeout', sLang, { username: winnerUsername })]
            : [
                isWinnerFound
                  ? this.i18n.translate('ws.games.timeoutWin', sLang)
                  : this.i18n.translate('ws.games.timeoutLoss', sLang),
              ],
        });
      }

      const gameId = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
      if (gameId) this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
    }, seconds * 1000);
    turnTimers.set(socket.id, t);
  }
}
