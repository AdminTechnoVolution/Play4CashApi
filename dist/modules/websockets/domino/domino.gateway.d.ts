import { OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit } from '@nestjs/websockets';
import { OnModuleInit } from '@nestjs/common';
import { GracePeriodService } from '../../../common/grace-period/grace-period.service';
import { TurnDeadlineService } from '../../../common/turn-deadline/turn-deadline.service';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { Model } from 'mongoose';
import { RoomsGateway } from '../rooms/rooms.gateway';
import { DominoGameDocument } from './schemas/domino-game.schema';
import { I18nService } from '../../../common/i18n/i18n.service';
export declare class DominoGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
    private readonly dominoModel;
    private readonly roomModel;
    private readonly userModel;
    private readonly config;
    private readonly roomsGateway;
    private readonly redis;
    private readonly i18n;
    private readonly grace;
    private readonly turnDeadlines;
    server: Server;
    private readonly logger;
    private usernameCache;
    private getCachedUsername;
    private getLang;
    constructor(dominoModel: Model<DominoGameDocument>, roomModel: Model<any>, userModel: Model<any>, config: ConfigService, roomsGateway: RoomsGateway, redis: any, i18n: I18nService, grace: GracePeriodService, turnDeadlines: TurnDeadlineService);
    onModuleInit(): void;
    private runWithRetry;
    afterInit(server: Server): void;
    handleConnection(client: Socket): void;
    handleDisconnect(client: Socket): Promise<void>;
    handleJoin(client: Socket, payload: {
        room_id: string;
    }): Promise<boolean | undefined>;
    handleMove(client: Socket, payload: {
        room_id: string;
        tile: number[];
        side: 'left' | 'right';
    }): Promise<boolean | undefined>;
    handleDraw(client: Socket, payload: {
        room_id: string;
    }): Promise<boolean | undefined>;
    handlePass(client: Socket, payload: {
        room_id: string;
    }): Promise<boolean | undefined>;
    private startTimer;
    eliminatePlayer(room_id: string, player_id: string, reason: 'forfeit' | 'timeout'): Promise<void>;
}
