import { OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit } from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
export declare class RoomsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    private readonly config;
    private readonly redis;
    server: Server;
    private readonly logger;
    constructor(config: ConfigService, redis: any);
    afterInit(server: Server): void;
    handleConnection(client: Socket): void;
    handleDisconnect(client: Socket): void;
    handleSubscribe(client: Socket, payload: {
        game_id: string;
    }): Promise<void>;
    handleUnsubscribe(client: Socket, payload: {
        game_id: string;
    }): Promise<void>;
    broadcastRoomUpdate(gameId: string, event: string, data: any): void;
}
