"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GracePeriodModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const grace_period_schema_1 = require("./grace-period.schema");
const grace_period_service_1 = require("./grace-period.service");
let GracePeriodModule = class GracePeriodModule {
};
exports.GracePeriodModule = GracePeriodModule;
exports.GracePeriodModule = GracePeriodModule = __decorate([
    (0, common_1.Global)(),
    (0, common_1.Module)({
        imports: [mongoose_1.MongooseModule.forFeature([{ name: grace_period_schema_1.GracePeriod.name, schema: grace_period_schema_1.GracePeriodSchema }])],
        providers: [grace_period_service_1.GracePeriodService],
        exports: [grace_period_service_1.GracePeriodService],
    })
], GracePeriodModule);
//# sourceMappingURL=grace-period.module.js.map