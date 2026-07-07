import { OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit } from '@nestjs/websockets';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { Model } from 'mongoose';
import { TournamentDocument } from '../../tournament/schemas/tournament.schema';
import { TournamentStateService } from '../../tournament/services/tournament-state.service';
import { TournamentPresenceService } from '../../tournament/services/tournament-presence.service';
export declare class TournamentsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
    private readonly tournamentModel;
    private readonly stateService;
    private readonly presenceService;
    private readonly config;
    private readonly redis;
    server: Server;
    private readonly logger;
    constructor(tournamentModel: Model<TournamentDocument>, stateService: TournamentStateService, presenceService: TournamentPresenceService, config: ConfigService, redis: any);
    afterInit(server: Server): void;
    handleConnection(client: Socket): void;
    handleDisconnect(client: Socket): void;
    private roomId;
    emitState(tournamentId: string): Promise<void>;
    emitMatchUpdate(tournamentId: string): Promise<void>;
    handleJoin(client: Socket, payload: {
        tournament_id?: string;
    }): Promise<boolean | undefined>;
    handleLeave(client: Socket): Promise<void>;
    handleGetState(client: Socket): Promise<boolean | undefined>;
    handleHeartbeat(client: Socket): Promise<void>;
}
