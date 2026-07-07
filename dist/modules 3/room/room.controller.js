"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var RoomController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoomController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const room_service_1 = require("./room.service");
const idempotency_service_1 = require("../../common/idempotency/idempotency.service");
const current_user_decorator_1 = require("../../common/decorators/current-user.decorator");
const class_validator_1 = require("class-validator");
const swagger_2 = require("@nestjs/swagger");
const admin_guard_1 = require("../../common/guards/admin.guard");
const public_decorator_1 = require("../../common/decorators/public.decorator");
const battleship_placement_dto_1 = require("./dtos/battleship-placement.dto");
class CreateRoomDto {
    game_id;
    bet_amount;
    public;
    name;
    player_limit;
}
__decorate([
    (0, swagger_2.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateRoomDto.prototype, "game_id", void 0);
__decorate([
    (0, swagger_2.ApiProperty)(),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(1),
    __metadata("design:type", Number)
], CreateRoomDto.prototype, "bet_amount", void 0);
__decorate([
    (0, swagger_2.ApiProperty)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], CreateRoomDto.prototype, "public", void 0);
__decorate([
    (0, swagger_2.ApiProperty)({ required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    __metadata("design:type", String)
], CreateRoomDto.prototype, "name", void 0);
__decorate([
    (0, swagger_2.ApiProperty)({ required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsNumber)(),
    __metadata("design:type", Number)
], CreateRoomDto.prototype, "player_limit", void 0);
class SetReadyDto {
    ready;
}
__decorate([
    (0, swagger_2.ApiProperty)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], SetReadyDto.prototype, "ready", void 0);
let RoomController = class RoomController {
    static { RoomController_1 = this; }
    roomService;
    idempotency;
    constructor(roomService, idempotency) {
        this.roomService = roomService;
        this.idempotency = idempotency;
    }
    static UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    getLiveStats() {
        return this.roomService.getLiveStats();
    }
    getActiveRoom(user, lang) {
        return this.roomService.getActiveRoomForUser(user.id, lang || 'en');
    }
    getRooms(gameId, lang) {
        return this.roomService.getRooms(gameId, lang || 'en');
    }
    getRoomStatus(id) {
        return this.roomService.getRoomStatus(id);
    }
    async createRoom(user, dto, lang, idempKey) {
        if (idempKey && RoomController_1.UUID_RE.test(idempKey)) {
            const cacheKey = `idem:rooms:create:${user.id}:${idempKey}`;
            return this.idempotency.getOrSet(cacheKey, idempotency_service_1.IdempotencyService.DEFAULT_TTL_SEC, () => this.roomService.createRoom(user.id, dto.game_id, dto.bet_amount, dto.public, dto.name, dto.player_limit, lang || 'en'));
        }
        return this.roomService.createRoom(user.id, dto.game_id, dto.bet_amount, dto.public, dto.name, dto.player_limit, lang || 'en');
    }
    joinRoom(user, id, lang) {
        return this.roomService.joinRoom(user.id, id, lang || 'en');
    }
    spectateRoom(user, id, lang) {
        return this.roomService.spectateRoom(user.id, id, lang || 'en');
    }
    leaveRoom(user, id, lang) {
        return this.roomService.leaveRoom(user.id, id, lang || 'en');
    }
    setReady(user, id, dto, lang) {
        return this.roomService.setReady(user.id, id, dto.ready, lang || 'en');
    }
    async deleteRoom(id) {
        await this.roomService.deleteRoom(id);
        return { success: true, messages: ['SUCCESS_DELETE'], data: null };
    }
    async savePlacement(user, id, dto, lang) {
        return this.roomService.saveBattleshipPlacement(user.id, id, dto.ships, lang || 'en');
    }
};
exports.RoomController = RoomController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('stats'),
    (0, swagger_1.ApiOperation)({ summary: 'Get live stats: online players, active games, sum of per-room stake (bet_amount), not × players' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], RoomController.prototype, "getLiveStats", null);
__decorate([
    (0, common_1.Get)('active'),
    (0, swagger_1.ApiOperation)({ summary: 'Get the current user\'s active room (waiting or started), if any' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Headers)('accept-language')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], RoomController.prototype, "getActiveRoom", null);
__decorate([
    (0, common_1.Get)('game/:game_id'),
    (0, swagger_1.ApiOperation)({ summary: 'Get all waiting/started rooms for a game' }),
    (0, swagger_1.ApiParam)({ name: 'game_id' }),
    __param(0, (0, common_1.Param)('game_id')),
    __param(1, (0, common_1.Headers)('accept-language')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], RoomController.prototype, "getRooms", null);
__decorate([
    (0, common_1.Get)(':id/status'),
    (0, swagger_1.ApiOperation)({ summary: 'Get room status (lightweight poll endpoint)' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], RoomController.prototype, "getRoomStatus", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create a new room (supports Idempotency-Key for safe retries)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Headers)('accept-language')),
    __param(3, (0, common_1.Headers)('idempotency-key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, CreateRoomDto, String, String]),
    __metadata("design:returntype", Promise)
], RoomController.prototype, "createRoom", null);
__decorate([
    (0, common_1.Post)(':id/join'),
    (0, swagger_1.ApiOperation)({ summary: 'Join an existing room' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Headers)('accept-language')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], RoomController.prototype, "joinRoom", null);
__decorate([
    (0, common_1.Post)(':id/spectate'),
    (0, swagger_1.ApiOperation)({ summary: 'Join a started room as a spectator' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Headers)('accept-language')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], RoomController.prototype, "spectateRoom", null);
__decorate([
    (0, common_1.Post)(':id/leave'),
    (0, swagger_1.ApiOperation)({ summary: 'Leave a room (waiting=remove, started=forfeit)' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Headers)('accept-language')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], RoomController.prototype, "leaveRoom", null);
__decorate([
    (0, common_1.Patch)(':id/ready'),
    (0, swagger_1.ApiOperation)({ summary: 'Set player ready status' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Headers)('accept-language')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, SetReadyDto, String]),
    __metadata("design:returntype", void 0)
], RoomController.prototype, "setReady", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Admin: delete a room' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], RoomController.prototype, "deleteRoom", null);
__decorate([
    (0, common_1.Post)(':id/battleship/placement'),
    (0, swagger_1.ApiOperation)({ summary: 'Battleship: Submit ship placement' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __param(3, (0, common_1.Headers)('accept-language')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, battleship_placement_dto_1.BattleshipPlacementDto, String]),
    __metadata("design:returntype", Promise)
], RoomController.prototype, "savePlacement", null);
exports.RoomController = RoomController = RoomController_1 = __decorate([
    (0, swagger_1.ApiTags)('Rooms'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('rooms'),
    __metadata("design:paramtypes", [room_service_1.RoomService,
        idempotency_service_1.IdempotencyService])
], RoomController);
//# sourceMappingURL=room.controller.js.map