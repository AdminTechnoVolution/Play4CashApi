import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RoomController } from './room.controller';
import { RoomService } from './room.service';
import { Room, RoomSchema } from './schemas/room.schema';
import { User, UserSchema } from '../user/schemas/user.schema';
import { Game, GameSchema } from '../game/schemas/game.schema';
import { BattleshipPlacement, BattleshipPlacementSchema } from '../naval-battle/schemas/battleship-placement.schema';
import { WebsocketsModule } from '../websockets/websockets.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Room.name, schema: RoomSchema },
      { name: User.name, schema: UserSchema },
      { name: Game.name, schema: GameSchema },
      { name: BattleshipPlacement.name, schema: BattleshipPlacementSchema },
    ]),
    WebsocketsModule, // imports RoomsGateway for WS broadcasts
  ],
  controllers: [RoomController],
  providers: [RoomService],
  exports: [RoomService],
})
export class RoomModule {}
