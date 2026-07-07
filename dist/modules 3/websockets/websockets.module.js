"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebsocketsModule = void 0;
const common_1 = require("@nestjs/common");
const mongoose_1 = require("@nestjs/mongoose");
const chess_gateway_1 = require("./chess/chess.gateway");
const domino_gateway_1 = require("./domino/domino.gateway");
const halma_gateway_1 = require("./halma/halma.gateway");
const naval_battle_gateway_1 = require("./naval-battle/naval-battle.gateway");
const rooms_gateway_1 = require("./rooms/rooms.gateway");
const rps_gateway_1 = require("./rps/rps.gateway");
const chat_gateway_1 = require("./chat/chat.gateway");
const uno_gateway_1 = require("./uno/uno.gateway");
const connect_four_gateway_1 = require("./connect-four/connect-four.gateway");
const connect_four_game_schema_1 = require("./connect-four/schemas/connect-four-game.schema");
const chess_game_schema_1 = require("./chess/schemas/chess-game.schema");
const halma_game_schema_1 = require("./halma/schemas/halma-game.schema");
const domino_game_schema_1 = require("./domino/schemas/domino-game.schema");
const uno_game_schema_1 = require("./uno/schemas/uno-game.schema");
const battleship_placement_schema_1 = require("../naval-battle/schemas/battleship-placement.schema");
const user_schema_1 = require("../user/schemas/user.schema");
const room_schema_1 = require("../room/schemas/room.schema");
const greeting_schema_1 = require("../greeting/schemas/greeting.schema");
let WebsocketsModule = class WebsocketsModule {
};
exports.WebsocketsModule = WebsocketsModule;
exports.WebsocketsModule = WebsocketsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            mongoose_1.MongooseModule.forFeature([
                { name: chess_game_schema_1.ChessGame.name, schema: chess_game_schema_1.ChessGameSchema },
                { name: halma_game_schema_1.HalmaGame.name, schema: halma_game_schema_1.HalmaGameSchema },
                { name: domino_game_schema_1.DominoGame.name, schema: domino_game_schema_1.DominoGameSchema },
                { name: uno_game_schema_1.UnoGame.name, schema: uno_game_schema_1.UnoGameSchema },
                { name: connect_four_game_schema_1.ConnectFourGame.name, schema: connect_four_game_schema_1.ConnectFourGameSchema },
                { name: battleship_placement_schema_1.BattleshipPlacement.name, schema: battleship_placement_schema_1.BattleshipPlacementSchema },
                { name: user_schema_1.User.name, schema: user_schema_1.UserSchema },
                { name: room_schema_1.Room.name, schema: room_schema_1.RoomSchema },
                { name: greeting_schema_1.Greeting.name, schema: greeting_schema_1.GreetingSchema },
            ]),
        ],
        providers: [
            chess_gateway_1.ChessGateway,
            domino_gateway_1.DominoGateway,
            halma_gateway_1.HalmaGateway,
            naval_battle_gateway_1.NavalBattleGateway,
            rooms_gateway_1.RoomsGateway,
            rps_gateway_1.RpsGateway,
            chat_gateway_1.ChatGateway,
            uno_gateway_1.UnoGateway,
            connect_four_gateway_1.ConnectFourGateway,
        ],
        exports: [
            rooms_gateway_1.RoomsGateway,
            naval_battle_gateway_1.NavalBattleGateway,
            halma_gateway_1.HalmaGateway,
            chess_gateway_1.ChessGateway,
            domino_gateway_1.DominoGateway,
            rps_gateway_1.RpsGateway,
            chat_gateway_1.ChatGateway,
            uno_gateway_1.UnoGateway,
            connect_four_gateway_1.ConnectFourGateway,
        ],
    })
], WebsocketsModule);
//# sourceMappingURL=websockets.module.js.map