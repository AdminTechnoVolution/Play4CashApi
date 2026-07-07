"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoomModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const room_controller_1 = require("./room.controller");
const room_service_1 = require("./room.service");
const room_schema_1 = require("./schemas/room.schema");
const user_schema_1 = require("../user/schemas/user.schema");
const game_schema_1 = require("../game/schemas/game.schema");
const battleship_placement_schema_1 = require("../naval-battle/schemas/battleship-placement.schema");
const websockets_module_1 = require("../websockets/websockets.module");
let RoomModule = class RoomModule {
};
exports.RoomModule = RoomModule;
exports.RoomModule = RoomModule = __decorate([
    (0, common_1.Module)({
        imports: [
            mongoose_1.MongooseModule.forFeature([
                { name: room_schema_1.Room.name, schema: room_schema_1.RoomSchema },
                { name: user_schema_1.User.name, schema: user_schema_1.UserSchema },
                { name: game_schema_1.Game.name, schema: game_schema_1.GameSchema },
                { name: battleship_placement_schema_1.BattleshipPlacement.name, schema: battleship_placement_schema_1.BattleshipPlacementSchema },
            ]),
            websockets_module_1.WebsocketsModule,
        ],
        controllers: [room_controller_1.RoomController],
        providers: [room_service_1.RoomService],
        exports: [room_service_1.RoomService],
    })
], RoomModule);
//# sourceMappingURL=room.module.js.map