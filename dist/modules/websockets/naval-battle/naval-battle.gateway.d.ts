import { OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit } from '@nestjs/websockets';
import { OnModuleInit } from '@nestjs/common';
import { GracePeriodService } from '../../../common/grace-period/grace-period.service';
import { TurnDeadlineService } from '../../../common/turn-deadline/turn-deadline.service';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { Model } from 'mongoose';
import { BattleshipPlacementDocument } from '../../naval-battle/schemas/battleship-placement.schema';
import { RoomsGateway } from '../rooms/rooms.gateway';
import { I18nService } from '../../../common/i18n/i18n.service';
import { TournamentMatchService } from '../../tournament/services/tournament-match.service';
export declare class NavalBattleGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
    private readonly placementModel;
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
    private getCachedUsername;
    constructor(placementModel: Model<BattleshipPlacementDocument>, roomModel: Model<any>, userModel: Model<any>, config: ConfigService, roomsGateway: RoomsGateway, redis: any, i18n: I18nService, grace: GracePeriodService, turnDeadlines: TurnDeadlineService, tournamentMatchService?: TournamentMatchService | undefined);
    onModuleInit(): void;
    afterInit(server: Server): void;
    handleConnection(client: Socket): Promise<void>;
    handleDisconnect(client: Socket): Promise<void>;
    private getLang;
    private processForfeit;
    private executeForfeit;
    handleJoin(client: Socket, payload: {
        room_id: string;
    }): Promise<void>;
    private syncPlayerState;
    handlePlaceShips(client: Socket, payload: {
        room_id: string;
        placements: any[];
    }): Promise<boolean | undefined>;
    handleFire(client: Socket, payload: {
        room_id: string;
        target: {
            row: number;
            col: number;
        };
    }): Promise<boolean | undefined>;
    startTimer(socket: Socket, room_id: string, seconds: number): void;
    private executeNavalTurnTimeout;
}
