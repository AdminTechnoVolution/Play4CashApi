import { OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit } from '@nestjs/websockets';
import { OnModuleInit } from '@nestjs/common';
import { GracePeriodService } from '../../../common/grace-period/grace-period.service';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { Model } from 'mongoose';
import { RoomsGateway } from '../rooms/rooms.gateway';
import { HalmaGameDocument } from './schemas/halma-game.schema';
import { I18nService } from '../../../common/i18n/i18n.service';
import { TournamentMatchService } from '../../tournament/services/tournament-match.service';
export declare class HalmaGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
    private readonly halmaModel;
    private readonly roomModel;
    private readonly userModel;
    private readonly config;
    private readonly roomsGateway;
    private readonly redis;
    private readonly i18n;
    private readonly grace;
    private readonly tournamentMatchService?;
    server: Server;
    private readonly logger;
    private usernameCache;
    private getCachedUsername;
    private getLang;
    constructor(halmaModel: Model<HalmaGameDocument>, roomModel: Model<any>, userModel: Model<any>, config: ConfigService, roomsGateway: RoomsGateway, redis: any, i18n: I18nService, grace: GracePeriodService, tournamentMatchService?: TournamentMatchService | undefined);
    onModuleInit(): void;
    afterInit(server: Server): void;
    handleConnection(client: Socket): void;
    handleDisconnect(client: Socket): Promise<void>;
    private executeForfeit;
    handleJoin(client: Socket, payload: {
        room_id: string;
    }): Promise<boolean | undefined>;
    handleMove(client: Socket, payload: any): Promise<boolean | undefined>;
    handleEndTurn(client: Socket, payload: {
        room_id: string;
    }): Promise<boolean | undefined>;
    private startTimer;
}
