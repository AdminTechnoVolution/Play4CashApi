"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const game_controller_1 = require("./game.controller");
const game_service_1 = require("./game.service");
const game_schema_1 = require("./schemas/game.schema");
const room_schema_1 = require("../room/schemas/room.schema");
let GameModule = class GameModule {
};
exports.GameModule = GameModule;
exports.GameModule = GameModule = __decorate([
    (0, common_1.Module)({
        imports: [mongoose_1.MongooseModule.forFeature([
                { name: game_schema_1.Game.name, schema: game_schema_1.GameSchema },
                { name: room_schema_1.Room.name, schema: room_schema_1.RoomSchema },
            ])],
        controllers: [game_controller_1.GameController],
        providers: [game_service_1.GameService],
        exports: [game_service_1.GameService],
    })
], GameModule);
//# sourceMappingURL=game.module.js.map