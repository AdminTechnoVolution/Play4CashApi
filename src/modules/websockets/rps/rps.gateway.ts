import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  MessageBody, ConnectedSocket, OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit,
} from '@nestjs/websockets';
import { Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { applyWsAuth } from '../../../common/guards/ws-auth.middleware';
import { REDIS_CLIENT } from '../../../common/redis/redis.module';

/** Rock-Paper-Scissors matchmaking gateway */
@WebSocketGateway({ namespace: '/rps', cors: { origin: '*', credentials: true } })
export class RpsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(RpsGateway.name);
  private readonly queue: Map<string, Socket> = new Map();

  constructor(
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: any,
  ) {}

  afterInit(server: Server) { applyWsAuth(server, this.config.get<string>('jwt.secret')!, this.redis); }

  handleConnection(client: Socket) { this.logger.log(`[RPS] Connected: ${client.id}`); }
  handleDisconnect(client: Socket) {
    this.queue.delete(client.id);
    this.logger.log(`[RPS] Disconnected: ${client.id}`);
  }

  @SubscribeMessage('join')
  async handleJoin(@ConnectedSocket() client: Socket, @MessageBody() payload: { game_id: string; bet_amount: number }) {
    if (!payload?.game_id) {
      client.emit('rps', { success: false, messages: ['Missing game_id'] });
      return;
    }

    const matchKey = `${payload.game_id}:${payload.bet_amount}`;
    this.queue.set(matchKey, client);

    // Simple two-player matchmaking
    const waitingEntries = [...this.queue.entries()].filter(([k]) => k.startsWith(matchKey));
    if (waitingEntries.length >= 2) {
      const [key1, player1] = waitingEntries[0];
      const [key2, player2] = waitingEntries[1];
      this.queue.delete(key1);
      this.queue.delete(key2);

      const roomId = `rps:${Date.now()}`;
      await player1.join(roomId);
      await player2.join(roomId);

      this.server.to(roomId).emit('rps', {
        success: true, messages: [],
        data: { event: 'match_found', room_id: roomId },
      });
    } else {
      client.emit('rps', { success: true, messages: [], data: { event: 'queued' } });
    }
  }
}
