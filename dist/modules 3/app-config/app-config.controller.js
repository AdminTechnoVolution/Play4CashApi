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
exports.AppConfigController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const app_config_service_1 = require("./app-config.service");
const admin_guard_1 = require("../../common/guards/admin.guard");
let AppConfigController = class AppConfigController {
    appConfigService;
    constructor(appConfigService) {
        this.appConfigService = appConfigService;
    }
    getConfig() { return this.appConfigService.getConfig(); }
    updateConfig(body) { return this.appConfigService.updateConfig(body); }
};
exports.AppConfigController = AppConfigController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get global app configuration' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AppConfigController.prototype, "getConfig", null);
__decorate([
    (0, common_1.Put)(),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    (0, swagger_1.ApiOperation)({ summary: 'Admin: update global app configuration' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AppConfigController.prototype, "updateConfig", null);
exports.AppConfigController = AppConfigController = __decorate([
    (0, swagger_1.ApiTags)('Config'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('config'),
    __metadata("design:paramtypes", [app_config_service_1.AppConfigService])
], AppConfigController);
//# sourceMappingURL=app-config.controller.js.map