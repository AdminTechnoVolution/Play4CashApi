"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GreetingModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const greeting_controller_1 = require("./greeting.controller");
const greeting_service_1 = require("./greeting.service");
const greeting_schema_1 = require("./schemas/greeting.schema");
let GreetingModule = class GreetingModule {
};
exports.GreetingModule = GreetingModule;
exports.GreetingModule = GreetingModule = __decorate([
    (0, common_1.Module)({
        imports: [mongoose_1.MongooseModule.forFeature([{ name: greeting_schema_1.Greeting.name, schema: greeting_schema_1.GreetingSchema }])],
        controllers: [greeting_controller_1.GreetingController],
        providers: [greeting_service_1.GreetingService],
        exports: [greeting_service_1.GreetingService],
    })
], GreetingModule);
//# sourceMappingURL=greeting.module.js.map