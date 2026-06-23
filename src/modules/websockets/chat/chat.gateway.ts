import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  MessageBody, ConnectedSocket, OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit,
} from '@nestjs/websockets';
import { Inject, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { Model } from 'mongoose';
import { buildWebSocketCorsOptions } from '../../../common/cors/origin-policy';
import { applyWsAuth } from '../../../common/guards/ws-auth.middleware';
import { REDIS_CLIENT } from '../../../common/redis/redis.module';

/**
 * ChatGateway handles the /chat namespace.
 * Used for in-game greetings/emotes within rooms.
 * Players join with their room_id, then can send greeting IDs
 * which get resolved to localized text per recipient.
 */
@WebSocketGateway({ namespace: '/chat', cors: buildWebSocketCorsOptions() })
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    @InjectModel('Greeting') private readonly greetingModel: Model<any>,
    @InjectModel('User') private readonly userModel: Model<any>,
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: any,
  ) {}

  afterInit(server: Server) {
    applyWsAuth(server, this.config, this.redis);
  }

  private getLang(client: Socket): string {
    const supported = ['es', 'en', 'fr', 'de', 'it', 'pt'];
    
    // 1. Priority: query parameter (e.g. ?lang=es)
    const queryLang = client.handshake?.query?.lang as string;
    if (queryLang && supported.includes(queryLang.toLowerCase())) {
      return queryLang.toLowerCase();
    }

    // 2. Stored data
    if (client.data?.lang && supported.includes(client.data.lang)) {
      return client.data.lang;
    }

    // 3. Fallback: accept-language header
    const headerLang = client.handshake.headers['accept-language'] as string;
    if (headerLang && supported.includes(headerLang.toLowerCase())) {
      return headerLang.toLowerCase();
    }

    return 'en';
  }

  handleConnection(client: Socket) {
    client.data.lang = this.getLang(client);
    this.logger.log(`[Chat] Connected: ${client.id} | lang=${client.data.lang}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`[Chat] Disconnected: ${client.id}`);
  }

  /** Join a room to send/receive greetings */
  @SubscribeMessage('join')
  async handleJoin(@ConnectedSocket() client: Socket, @MessageBody() payload: { room_id: string }) {
    if (!payload?.room_id) return client.emit('chat', { success: false, messages: ['Missing room_id'] });
    await client.join(payload.room_id);
    client.data.room_id = payload.room_id;
    client.emit('chat', { success: true, messages: [], data: { joined: true, room_id: payload.room_id } });
  }

  /** Send a greeting to all other players in the room, each in their own language */
  @SubscribeMessage('greeting')
  async handleGreeting(@ConnectedSocket() client: Socket, @MessageBody() payload: { room_id: string; greeting_id: string }) {
    if (!payload?.room_id || !payload?.greeting_id) {
      return client.emit('chat', { success: false, messages: ['Missing room_id or greeting_id'] });
    }

    const { room_id, greeting_id } = payload;
    const sender_id = client.data.player_id;

    // Look up the greeting (full multi-language object)
    const greeting = await this.greetingModel.findById(greeting_id).lean();
    if (!greeting || !greeting.active) {
      return client.emit('chat', { success: false, messages: ['ws.chat.greetingNotFound'] });
    }

    // Look up sender username
    const senderUser = await this.userModel.findById(sender_id).select('username');
    const senderUsername = senderUser?.username || 'Unknown';

    // Get all sockets in the room
    const sockets = await this.server.in(room_id).fetchSockets();

    // Send to each player EXCEPT the sender, in their own language
    for (const s of sockets) {
      const pid = (s as any).data.player_id;
      if (pid === sender_id) continue; // skip sender

      const recipientLang = this.getLang(s as unknown as Socket);
      const localizedText = greeting.text?.[recipientLang] || greeting.text?.en || '';

      (s as unknown as Socket).emit('chat', {
        success: true,
        data: {
          type: 'greeting',
          greeting_id,
          text: localizedText,
          from: senderUsername,
        },
        messages: [],
      });
    }

    // Confirm to sender
    const senderLang = this.getLang(client);
    client.emit('chat', {
      success: true,
      data: {
        type: 'greeting_sent',
        greeting_id,
        text: greeting.text?.[senderLang] || greeting.text?.en || '',
      },
      messages: [],
    });
  }
}
