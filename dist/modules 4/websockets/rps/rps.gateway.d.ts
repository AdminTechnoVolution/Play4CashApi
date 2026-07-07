import { OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit } from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
export declare class RpsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    private readonly config;
    private readonly redis;
    server: Server;
    private readonly logger;
    private readonly queue;
    constructor(config: ConfigService, redis: any);
    afterInit(server: Server): void;
    handleConnection(client: Socket): void;
    handleDisconnect(client: Socket): void;
    handleJoin(client: Socket, payload: {
        game_id: string;
        bet_amount: number;
    }): Promise<void>;
}
