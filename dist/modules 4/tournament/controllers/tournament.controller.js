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
exports.TournamentController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const current_user_decorator_1 = require("../../../common/decorators/current-user.decorator");
const tournament_state_service_1 = require("../services/tournament-state.service");
const tournament_registration_service_1 = require("../services/tournament-registration.service");
const tournament_admin_service_1 = require("../services/tournament-admin.service");
let TournamentController = class TournamentController {
    stateService;
    registrationService;
    adminService;
    constructor(stateService, registrationService, adminService) {
        this.stateService = stateService;
        this.registrationService = registrationService;
        this.adminService = adminService;
    }
    async list(user, lang) {
        const list = await this.stateService.listVisible();
        const data = await Promise.all(list.map((t) => this.stateService.toPublicDetail(t, user?.id, lang)));
        return { success: true, messages: [], data };
    }
    async history(user, lang) {
        const data = await this.stateService.listHistoryForUser(user.id, lang);
        return { success: true, messages: [], data };
    }
    async mine(user, lang) {
        const data = await this.stateService.listForUser(user.id, lang);
        return { success: true, messages: [], data };
    }
    async getOne(id, user, lang) {
        const t = await this.adminService.findById(id);
        const data = await this.stateService.toPublicDetail(t, user.id, lang);
        return { success: true, messages: [], data };
    }
    async getState(id, user, lang) {
        const t = await this.adminService.findById(id);
        const detail = await this.stateService.toPublicDetail(t, user.id, lang);
        return { success: true, messages: [], data: detail };
    }
    async getBracket(id) {
        const data = await this.stateService.getBracket(id);
        return { success: true, messages: [], data };
    }
    async register(id, user, idempotencyKey) {
        const data = await this.registrationService.register(id, user.id, idempotencyKey);
        return { success: true, messages: [], data };
    }
    async unregister(id, user, idempotencyKey) {
        const data = await this.registrationService.unregister(id, user.id, idempotencyKey);
        return { success: true, messages: [], data };
    }
};
exports.TournamentController = TournamentController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'List visible tournaments' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Headers)('accept-language')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], TournamentController.prototype, "list", null);
__decorate([
    (0, common_1.Get)('history'),
    (0, swagger_1.ApiOperation)({ summary: 'Past tournaments and results for current user' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Headers)('accept-language')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], TournamentController.prototype, "history", null);
__decorate([
    (0, common_1.Get)('mine'),
    (0, swagger_1.ApiOperation)({ summary: 'My registered upcoming/live tournaments' }),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Headers)('accept-language')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], TournamentController.prototype, "mine", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Tournament detail' }),
    (0, swagger_1.ApiParam)({ name: 'id' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Headers)('accept-language')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", Promise)
], TournamentController.prototype, "getOne", null);
__decorate([
    (0, common_1.Get)(':id/state'),
    (0, swagger_1.ApiOperation)({ summary: 'Compact tournament state + official time' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Headers)('accept-language')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", Promise)
], TournamentController.prototype, "getState", null);
__decorate([
    (0, common_1.Get)(':id/bracket'),
    (0, swagger_1.ApiOperation)({ summary: 'Bracket (5 groups + finals)' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TournamentController.prototype, "getBracket", null);
__decorate([
    (0, common_1.Post)(':id/register'),
    (0, swagger_1.ApiOperation)({ summary: 'Register for tournament (Idempotency-Key required)' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Headers)('idempotency-key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", Promise)
], TournamentController.prototype, "register", null);
__decorate([
    (0, common_1.Post)(':id/unregister'),
    (0, swagger_1.ApiOperation)({ summary: 'Unregister before locking (Idempotency-Key required)' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, current_user_decorator_1.CurrentUser)()),
    __param(2, (0, common_1.Headers)('idempotency-key')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", Promise)
], TournamentController.prototype, "unregister", null);
exports.TournamentController = TournamentController = __decorate([
    (0, swagger_1.ApiTags)('Tournaments'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('tournaments'),
    __metadata("design:paramtypes", [tournament_state_service_1.TournamentStateService,
        tournament_registration_service_1.TournamentRegistrationService,
        tournament_admin_service_1.TournamentAdminService])
], TournamentController);
//# sourceMappingURL=tournament.controller.js.map