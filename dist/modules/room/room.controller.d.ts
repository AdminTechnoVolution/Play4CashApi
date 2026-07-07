import { RoomService } from './room.service';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
import { BattleshipPlacementDto } from './dtos/battleship-placement.dto';
declare class CreateRoomDto {
    game_id: string;
    bet_amount: number;
    public: boolean;
    name?: string;
    player_limit?: number;
}
declare class SetReadyDto {
    ready: boolean;
}
export declare class RoomController {
    private readonly roomService;
    private readonly idempotency;
    constructor(roomService: RoomService, idempotency: IdempotencyService);
    private static readonly UUID_RE;
    getLiveStats(): Promise<any>;
    getActiveRoom(user: JwtPayload, lang: string): Promise<any>;
    getRooms(gameId: string, lang: string): Promise<any>;
    getRoomStatus(id: string): Promise<any>;
    createRoom(user: JwtPayload, dto: CreateRoomDto, lang: string, idempKey?: string): Promise<import("./schemas/room.schema").RoomDocument>;
    joinRoom(user: JwtPayload, id: string, lang: string): Promise<import("./schemas/room.schema").RoomDocument>;
    spectateRoom(user: JwtPayload, id: string, lang: string): Promise<import("./schemas/room.schema").RoomDocument>;
    leaveRoom(user: JwtPayload, id: string, lang: string): Promise<any>;
    setReady(user: JwtPayload, id: string, dto: SetReadyDto, lang: string): Promise<import("./schemas/room.schema").RoomDocument>;
    deleteRoom(id: string): Promise<{
        success: boolean;
        messages: string[];
        data: null;
    }>;
    savePlacement(user: JwtPayload, id: string, dto: BattleshipPlacementDto, lang: string): Promise<any>;
}
export {};
