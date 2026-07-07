import { OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit } from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { Model } from 'mongoose';
export declare class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    private readonly greetingModel;
    private readonly userModel;
    private readonly config;
    private readonly redis;
    server: Server;
    private readonly logger;
    constructor(greetingModel: Model<any>, userModel: Model<any>, config: ConfigService, redis: any);
    afterInit(server: Server): void;
    private getLang;
    handleConnection(client: Socket): void;
    handleDisconnect(client: Socket): void;
    handleJoin(client: Socket, payload: {
        room_id: string;
    }): Promise<boolean | undefined>;
    handleGreeting(client: Socket, payload: {
        room_id: string;
        greeting_id: string;
    }): Promise<boolean | undefined>;
}
