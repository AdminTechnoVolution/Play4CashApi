import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChessGateway } from './chess/chess.gateway';
import { DominoGateway } from './domino/domino.gateway';
import { HalmaGateway } from './halma/halma.gateway';
import { NavalBattleGateway } from './naval-battle/naval-battle.gateway';
import { RoomsGateway } from './rooms/rooms.gateway';
import { RpsGateway } from './rps/rps.gateway';
import { ChatGateway } from './chat/chat.gateway';
import { UnoGateway } from './uno/uno.gateway';
import { ConnectFourGateway } from './connect-four/connect-four.gateway';
import { ConnectFourGame, ConnectFourGameSchema } from './connect-four/schemas/connect-four-game.schema';
import { ChessGame, ChessGameSchema } from './chess/schemas/chess-game.schema';
import { HalmaGame, HalmaGameSchema } from './halma/schemas/halma-game.schema';
import { DominoGame, DominoGameSchema } from './domino/schemas/domino-game.schema';
import { UnoGame, UnoGameSchema } from './uno/schemas/uno-game.schema';
import { BattleshipPlacement, BattleshipPlacementSchema } from '../naval-battle/schemas/battleship-placement.schema';
import { User, UserSchema } from '../user/schemas/user.schema';
import { Room, RoomSchema } from '../room/schemas/room.schema';
import { TournamentModule } from '../tournament/tournament.module';
import { Greeting, GreetingSchema } from '../greeting/schemas/greeting.schema';

@Module({
  imports: [
    TournamentModule,
    MongooseModule.forFeature([
      { name: ChessGame.name, schema: ChessGameSchema },
      { name: HalmaGame.name, schema: HalmaGameSchema },
      { name: DominoGame.name, schema: DominoGameSchema },
      { name: UnoGame.name, schema: UnoGameSchema },
      { name: ConnectFourGame.name, schema: ConnectFourGameSchema },
      { name: BattleshipPlacement.name, schema: BattleshipPlacementSchema },
      { name: User.name, schema: UserSchema },
      { name: Room.name, schema: RoomSchema },
      { name: Greeting.name, schema: GreetingSchema },
    ]),
  ],
  providers: [
    ChessGateway,
    DominoGateway,
    HalmaGateway,
    NavalBattleGateway,
    RoomsGateway,
    RpsGateway,
    ChatGateway,
    UnoGateway,
    ConnectFourGateway,
  ],
  exports: [
    RoomsGateway,
    NavalBattleGateway,
    HalmaGateway,
    ChessGateway,
    DominoGateway,
    RpsGateway,
    ChatGateway,
    UnoGateway,
    ConnectFourGateway,
  ],
})
export class WebsocketsModule {}
