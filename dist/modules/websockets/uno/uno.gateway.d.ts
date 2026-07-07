import { OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit } from '@nestjs/websockets';
import { OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GracePeriodService } from '../../../common/grace-period/grace-period.service';
import { TurnDeadlineService } from '../../../common/turn-deadline/turn-deadline.service';
import { Server, Socket } from 'socket.io';
import { Model } from 'mongoose';
import { RoomsGateway } from '../rooms/rooms.gateway';
import { UnoGameDocument } from './schemas/uno-game.schema';
import { I18nService } from '../../../common/i18n/i18n.service';
export declare class UnoGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
    private readonly unoModel;
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
    constructor(unoModel: Model<UnoGameDocument>, roomModel: Model<any>, userModel: Model<any>, config: ConfigService, roomsGateway: RoomsGateway, redis: any, i18n: I18nService, grace: GracePeriodService, turnDeadlines: TurnDeadlineService);
    onModuleInit(): void;
    private runWithRetry;
    private getLang;
    private getCachedUsername;
    private getHands;
    afterInit(server: Server): void;
    handleConnection(client: Socket): void;
    handleDisconnect(client: Socket): Promise<void>;
    handleJoin(client: Socket, payload: {
        room_id: string;
    }): Promise<boolean | undefined>;
    private tryStartUnoGame;
    handleSync(client: Socket, payload: {
        room_id?: string;
    }): Promise<boolean | undefined>;
    handlePlayCard(client: Socket, payload: {
        room_id?: string;
        card_index: number;
        chosen_color?: string;
        call_uno?: boolean;
    }): Promise<boolean | undefined>;
    handleCallUno(client: Socket, payload: {
        room_id?: string;
    }): Promise<boolean | undefined>;
    handleChallengeUnoMiss(client: Socket, payload: {
        room_id?: string;
        offender_id: string;
    }): Promise<boolean | undefined>;
    handleStartNextRound(client: Socket, payload: {
        room_id?: string;
    }): Promise<boolean | undefined>;
    handleTakeDrawStack(client: Socket, payload: {
        room_id?: string;
    }): Promise<boolean | undefined>;
    handleDrawOne(client: Socket, payload: {
        room_id?: string;
    }): Promise<boolean | undefined>;
    handlePass(client: Socket, payload: {
        room_id?: string;
    }): Promise<boolean | undefined>;
    private gameToEngine;
    private applyEngineToGame;
    private applyEngineToGameNoTurnReset;
    private copyEngineFields;
    private unoReasonToMessageKey;
    private clearTimersInRoom;
    private refreshMemberSpectatorFlags;
    private broadcastUnoGameState;
    private finalizeUnoRoundWinner;
    private finalizeMatchEnd;
    private broadcastRoundEnd;
    private startNextRound;
    processBetweenRoundsTimeouts(): Promise<void>;
    private getMatchScoresMap;
    private emitUnoStateToClient;
    private buildUnoPayloadSync;
    private startTimer;
    eliminatePlayer(room_id: string, player_id: string, reason: 'forfeit' | 'timeout'): Promise<void>;
}
