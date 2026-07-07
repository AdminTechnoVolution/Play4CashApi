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
exports.GreetingController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const greeting_service_1 = require("./greeting.service");
const admin_guard_1 = require("../../common/guards/admin.guard");
const swagger_2 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class CreateGreetingDto {
    text;
}
__decorate([
    (0, swagger_2.ApiProperty)({
        example: { es: '¡Hola!', en: 'Hello!', fr: 'Bonjour!', de: 'Hallo!', it: 'Ciao!', pt: 'Olá!' },
    }),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], CreateGreetingDto.prototype, "text", void 0);
class UpdateGreetingDto {
    text;
    active;
}
__decorate([
    (0, swagger_2.ApiProperty)({ required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsObject)(),
    __metadata("design:type", Object)
], UpdateGreetingDto.prototype, "text", void 0);
__decorate([
    (0, swagger_2.ApiProperty)({ required: false }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], UpdateGreetingDto.prototype, "active", void 0);
let GreetingController = class GreetingController {
    greetingService;
    constructor(greetingService) {
        this.greetingService = greetingService;
    }
    getRandom(lang) {
        return this.greetingService.getRandom(lang || 'en');
    }
    getAll() {
        return this.greetingService.getAll();
    }
    create(dto) {
        return this.greetingService.create(dto);
    }
    update(id, dto) {
        return this.greetingService.update(id, dto);
    }
    delete(id) {
        return this.greetingService.delete(id);
    }
};
exports.GreetingController = GreetingController;
__decorate([
    (0, common_1.Get)(),
    (0, swagger_1.ApiOperation)({ summary: 'Get 5 random greetings (localized)' }),
    __param(0, (0, common_1.Headers)('accept-language')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], GreetingController.prototype, "getRandom", null);
__decorate([
    (0, common_1.Get)('all'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    (0, swagger_1.ApiOperation)({ summary: '[Admin] Get all greetings' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], GreetingController.prototype, "getAll", null);
__decorate([
    (0, common_1.Post)(),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    (0, swagger_1.ApiOperation)({ summary: '[Admin] Create a greeting' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [CreateGreetingDto]),
    __metadata("design:returntype", void 0)
], GreetingController.prototype, "create", null);
__decorate([
    (0, common_1.Patch)(':id'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    (0, swagger_1.ApiOperation)({ summary: '[Admin] Update a greeting' }),
    (0, swagger_1.ApiParam)({ name: 'id' }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, UpdateGreetingDto]),
    __metadata("design:returntype", void 0)
], GreetingController.prototype, "update", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, common_1.UseGuards)(admin_guard_1.AdminGuard),
    (0, swagger_1.ApiOperation)({ summary: '[Admin] Delete a greeting' }),
    (0, swagger_1.ApiParam)({ name: 'id' }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], GreetingController.prototype, "delete", null);
exports.GreetingController = GreetingController = __decorate([
    (0, swagger_1.ApiTags)('Greetings'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)('greetings'),
    __metadata("design:paramtypes", [greeting_service_1.GreetingService])
], GreetingController);
//# sourceMappingURL=greeting.controller.js.map