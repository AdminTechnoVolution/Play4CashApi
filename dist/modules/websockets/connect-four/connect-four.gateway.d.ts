import { OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit } from '@nestjs/websockets';
import { OnModuleInit } from '@nestjs/common';
import { GracePeriodService } from '../../../common/grace-period/grace-period.service';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { Model } from 'mongoose';
import { RoomsGateway } from '../rooms/rooms.gateway';
import { ConnectFourGameDocument } from './schemas/connect-four-game.schema';
import { I18nService } from '../../../common/i18n/i18n.service';
import { TournamentMatchService } from '../../tournament/services/tournament-match.service';
import { TurnDeadlineService } from '../../../common/turn-deadline/turn-deadline.service';
export declare class ConnectFourGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
    private readonly gameModel;
    private readonly roomModel;
    private readonly userModel;
    private readonly config;
    private readonly roomsGateway;
    private readonly redis;
    private readonly i18n;
    private readonly grace;
    private readonly turnDeadlines;
    private readonly tournamentMatchService?;
    server: Server;
    private readonly logger;
    private usernameCache;
    constructor(gameModel: Model<ConnectFourGameDocument>, roomModel: Model<any>, userModel: Model<any>, config: ConfigService, roomsGateway: RoomsGateway, redis: any, i18n: I18nService, grace: GracePeriodService, turnDeadlines: TurnDeadlineService, tournamentMatchService?: TournamentMatchService | undefined);
    onModuleInit(): void;
    afterInit(server: Server): void;
    private getLang;
    private getCachedUsername;
    private emit;
    private buildPublicState;
    private formatLastMoveFromGame;
    handleConnection(client: Socket): void;
    handleDisconnect(client: Socket): Promise<void>;
    executeForfeit(room_id: string, player_id: string): Promise<void>;
    handleJoin(client: Socket, payload: {
        room_id: string;
    }): Promise<void>;
    private resolvePlayerNum;
    private countPlayerSockets;
    private tryStartConnectFourGame;
    handleGetState(client: Socket, payload: {
        room_id: string;
    }): Promise<void>;
    private finalizeConnectFourMatch;
    handleDropDisc(client: Socket, payload: {
        room_id?: string;
        col: number;
    }): Promise<void>;
    handleForfeit(client: Socket, payload: {
        room_id?: string;
    }): Promise<void>;
    private startTimer;
    private executeConnectFourTurnTimeout;
}
