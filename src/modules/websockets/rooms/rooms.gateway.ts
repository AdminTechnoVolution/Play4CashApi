import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  MessageBody, ConnectedSocket, OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit,
} from '@nestjs/websockets';
import { Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { applyWsAuth } from '../../../common/guards/ws-auth.middleware';
import { REDIS_CLIENT } from '../../../common/redis/redis.module';

/**
 * RoomsGateway handles the /rooms namespace.
 * Clients subscribe to Game-scoped channels (game:{game_id}) and receive
 * broadcasts when rooms in that game change, preventing broadcast storms.
 */
@WebSocketGateway({ namespace: '/rooms', cors: { origin: '*', credentials: true } })
export class RoomsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(RoomsGateway.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: any,
  ) {}

  afterInit(server: Server) { applyWsAuth(server, this.config, this.redis); }

  handleConnection(client: Socket) { this.logger.log(`[Rooms] Connected: ${client.id}`); }
  handleDisconnect(client: Socket) { this.logger.log(`[Rooms] Disconnected: ${client.id}`); }

  @SubscribeMessage('subscribe')
  async handleSubscribe(@ConnectedSocket() client: Socket, @MessageBody() payload: { game_id: string }) {
    if (!payload?.game_id) {
      client.emit('rooms', { success: false, messages: ['Missing game_id'] });
      return;
    }
    await client.join(`game:${payload.game_id}`);
    client.emit('rooms', { success: true, messages: [], data: { event: 'subscribed', game_id: payload.game_id } });
  }

  @SubscribeMessage('unsubscribe')
  async handleUnsubscribe(@ConnectedSocket() client: Socket, @MessageBody() payload: { game_id: string }) {
    if (!payload?.game_id) return;
    await client.leave(`game:${payload.game_id}`);
    client.emit('rooms', { success: true, messages: [], data: { event: 'unsubscribed', game_id: payload.game_id } });
  }

  /** Called by RoomService to broadcast room updates to subscribed clients */
  broadcastRoomUpdate(gameId: string, event: string, data: any): void {
    this.server.to(`game:${gameId}`).emit(event, data);
  }
}
