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
import { Inject, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { Model } from 'mongoose';
import { applyWsAuth } from '../../../common/guards/ws-auth.middleware';
import { REDIS_CLIENT } from '../../../common/redis/redis.module';
import { Tournament, TournamentDocument } from '../../tournament/schemas/tournament.schema';
import { TournamentStateService } from '../../tournament/services/tournament-state.service';
import { TournamentPresenceService } from '../../tournament/services/tournament-presence.service';
import { resolveWsLang } from '../../tournament/tournament-language.util';

const EVENT = 'tournament';

@WebSocketGateway({ namespace: '/tournaments', cors: { origin: '*', credentials: true } })
export class TournamentsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(TournamentsGateway.name);

  constructor(
    @InjectModel(Tournament.name) private readonly tournamentModel: Model<TournamentDocument>,
    private readonly stateService: TournamentStateService,
    private readonly presenceService: TournamentPresenceService,
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: any,
  ) {}

  afterInit(server: Server) {
    applyWsAuth(server, this.config, this.redis);
  }

  handleConnection(client: Socket) {
    this.logger.log(`[Tournaments] Connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    const tid = client.data.tournament_id as string | undefined;
    const uid = client.data.player_id as string | undefined;
    if (tid && uid) void this.presenceService.clear(tid, uid);
    this.logger.log(`[Tournaments] Disconnected: ${client.id}`);
  }

  private roomId(tournamentId: string): string {
    return `tournament:${tournamentId}`;
  }

  async emitState(tournamentId: string): Promise<void> {
    const t = await this.tournamentModel.findById(tournamentId);
    if (!t) return;
    const room = this.roomId(tournamentId);
    const sockets = await this.server.in(room).fetchSockets();
    await Promise.all(
      sockets.map(async (remote) => {
        const lang = resolveWsLang(remote as unknown as Socket);
        const uid = remote.data.player_id as string | undefined;
        const data = await this.stateService.toPublicDetail(t, uid, lang);
        remote.emit(EVENT, {
          success: true,
          event: 'tournament:state',
          data,
          messages: [],
        });
      }),
    );
  }

  @SubscribeMessage('tournament:join')
  async handleJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { tournament_id?: string },
  ) {
    const tournamentId = payload?.tournament_id;
    if (!tournamentId) {
      return client.emit(EVENT, { success: false, event: 'tournament:error', messages: ['Missing tournament_id'] });
    }
    await client.join(this.roomId(tournamentId));
    client.data.tournament_id = tournamentId;
    client.data.lang = resolveWsLang(client);
    const uid = client.data.player_id as string;
    if (uid) await this.presenceService.markPresent(tournamentId, uid);
    const t = await this.tournamentModel.findById(tournamentId);
    if (!t) {
      return client.emit(EVENT, { success: false, event: 'tournament:error', messages: ['Not found'] });
    }
    const data = await this.stateService.toPublicDetail(t, uid, client.data.lang);
    client.emit(EVENT, { success: true, event: 'tournament:state', data, messages: [] });
  }

  @SubscribeMessage('tournament:leave')
  async handleLeave(@ConnectedSocket() client: Socket) {
    const tid = client.data.tournament_id as string | undefined;
    const uid = client.data.player_id as string | undefined;
    if (tid) await client.leave(this.roomId(tid));
    if (tid && uid) await this.presenceService.clear(tid, uid);
    client.data.tournament_id = undefined;
    client.emit(EVENT, { success: true, event: 'tournament:left', data: {}, messages: [] });
  }

  @SubscribeMessage('tournament:getState')
  async handleGetState(@ConnectedSocket() client: Socket) {
    const tid = client.data.tournament_id as string | undefined;
    if (!tid) {
      return client.emit(EVENT, { success: false, event: 'tournament:error', messages: ['Not joined'] });
    }
    const t = await this.tournamentModel.findById(tid);
    if (!t) return;
    const lang = client.data.lang ?? resolveWsLang(client);
    const data = await this.stateService.toPublicDetail(t, client.data.player_id, lang);
    client.emit(EVENT, { success: true, event: 'tournament:state', data, messages: [] });
  }

  @SubscribeMessage('tournament:heartbeat')
  async handleHeartbeat(@ConnectedSocket() client: Socket) {
    const tid = client.data.tournament_id as string | undefined;
    const uid = client.data.player_id as string | undefined;
    if (tid && uid) await this.presenceService.markPresent(tid, uid);
  }
}
