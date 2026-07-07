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
exports.TournamentAdminController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const roles_decorator_1 = require("../../../common/decorators/roles.decorator");
const roles_guard_1 = require("../../../common/guards/roles.guard");
const tournament_admin_service_1 = require("../services/tournament-admin.service");
const tournament_state_service_1 = require("../services/tournament-state.service");
const tournament_dto_1 = require("../dtos/tournament.dto");
const tournament_ledger_service_1 = require("../services/tournament-ledger.service");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const tournament_participant_schema_1 = require("../schemas/tournament-participant.schema");
let TournamentAdminController = class TournamentAdminController {
    adminService;
    stateService;
    ledger;
    participantModel;
    constructor(adminService, stateService, ledger, participantModel) {
        this.adminService = adminService;
        this.stateService = stateService;
        this.ledger = ledger;
        this.participantModel = participantModel;
    }
    async findAll() {
        const list = await this.adminService.findAll();
        const data = await Promise.all(list.map((t) => this.stateService.toAdminDetail(t)));
        return { success: true, messages: [], data };
    }
    async findOne(id) {
        const t = await this.adminService.findById(id);
        const data = await this.stateService.toAdminDetail(t);
        return { success: true, messages: [], data };
    }
    async create(body) {
        const t = await this.adminService.create(body);
        const data = await this.stateService.toAdminDetail(t);
        return { success: true, messages: [], data };
    }
    async update(id, body) {
        const t = await this.adminService.update(id, body);
        const data = await this.stateService.toAdminDetail(t);
        return { success: true, messages: [], data };
    }
    async open(id) {
        const t = await this.adminService.open(id);
        const data = await this.stateService.toAdminDetail(t);
        return { success: true, messages: [], data };
    }
    async cancel(id) {
        const t = await this.adminService.cancel(id);
        const parts = await this.participantModel.find({ tournament_id: t._id });
        await this.ledger.refundAllRegistered(t._id, parts.map((p) => ({ user_id: p.user_id, amount: t.buy_in })));
        const data = await this.stateService.toAdminDetail(t);
        return { success: true, messages: [], data };
    }
    async forceStart(id) {
        const t = await this.adminService.findById(id);
        t.starts_at = new Date();
        await t.save();
        const data = await this.stateService.toAdminDetail(t);
        return { success: true, messages: [], data };
    }
};
exports.TournamentAdminController = TournamentAdminController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'List all tournaments (full i18n + editable fields)' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], TournamentAdminController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Get tournament detail (admin, full i18n)' }),
    (0, swagger_1.ApiParam)({ name: 'id' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TournamentAdminController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({ summary: 'Create tournament (draft)' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [tournament_dto_1.CreateTournamentDto]),
    __metadata("design:returntype", Promise)
], TournamentAdminController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, swagger_1.ApiOperation)({ summary: 'Update draft tournament (all configurable fields)' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, tournament_dto_1.UpdateTournamentDto]),
    __metadata("design:returntype", Promise)
], TournamentAdminController.prototype, "update", null);
__decorate([
    (0, common_1.Post)(':id/open'),
    (0, swagger_1.ApiOperation)({ summary: 'Open tournament for registration' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TournamentAdminController.prototype, "open", null);
__decorate([
    (0, common_1.Post)(':id/cancel'),
    (0, swagger_1.ApiOperation)({ summary: 'Cancel tournament and refund registrations' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TournamentAdminController.prototype, "cancel", null);
__decorate([
    (0, common_1.Post)(':id/start'),
    (0, swagger_1.ApiOperation)({ summary: 'Force start tournament (admin override)' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], TournamentAdminController.prototype, "forceStart", null);
exports.TournamentAdminController = TournamentAdminController = __decorate([
    (0, swagger_1.ApiTags)('Admin · Tournaments'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('admin/tournaments'),
    (0, common_1.UseGuards)(roles_guard_1.RolesGuard),
    (0, roles_decorator_1.Roles)('admin'),
    __param(3, (0, mongoose_1.InjectModel)(tournament_participant_schema_1.TournamentParticipant.name)),
    __metadata("design:paramtypes", [tournament_admin_service_1.TournamentAdminService,
        tournament_state_service_1.TournamentStateService,
        tournament_ledger_service_1.TournamentLedgerService,
        mongoose_2.Model])
], TournamentAdminController);
//# sourceMappingURL=tournament-admin.controller.js.map