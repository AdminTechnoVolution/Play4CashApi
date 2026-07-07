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
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameAdminController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const roles_decorator_1 = require("../../common/decorators/roles.decorator");
const roles_guard_1 = require("../../common/guards/roles.guard");
const game_service_1 = require("./game.service");
const game_admin_dto_1 = require("./dtos/game-admin.dto");
let GameAdminController = class GameAdminController {
    gameService;
    constructor(gameService) {
        this.gameService = gameService;
    }
    async findAll() {
        const data = await this.gameService.findAllAdmin();
        return { success: true, messages: [], data };
    }
    async findById(id) {
        const data = await this.gameService.findByIdAdmin(id);
        return { success: true, messages: [], data };
    }
    async create(body) {
        const data = await this.gameService.create(body);
        return { success: true, messages: [], data };
    }
    async update(id, body) {
        const data = await this.gameService.update(id, body);
        return { success: true, messages: [], data };
    }
    async remove(id) {
        await this.gameService.remove(id);
        return { success: true, messages: ['SUCCESS_DELETE'], data: null };
    }
};
exports.GameAdminController = GameAdminController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'List all games with full multilingual name, description, and rules' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], GameAdminController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Get one game with full multilingual fields' }),
    (0, swagger_1.ApiParam)({ name: 'id' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], GameAdminController.prototype, "findById", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create a game (multilingual name, description, rules)' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [game_admin_dto_1.CreateGameDto]),
    __metadata("design:returntype", Promise)
], GameAdminController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Update a game (multilingual name, description, rules)' }),
    (0, swagger_1.ApiParam)({ name: 'id' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, game_admin_dto_1.UpdateGameDto]),
    __metadata("design:returntype", Promise)
], GameAdminController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Delete a game' }),
    (0, swagger_1.ApiParam)({ name: 'id' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], GameAdminController.prototype, "remove", null);
exports.GameAdminController = GameAdminController = __decorate([
    (0, swagger_1.ApiTags)('Admin · Games'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('admin/games'),
    (0, common_1.UseGuards)(roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('admin'),
    __metadata("design:paramtypes", [game_service_1.GameService])
], GameAdminController);
//# sourceMappingURL=game-admin.controller.js.map