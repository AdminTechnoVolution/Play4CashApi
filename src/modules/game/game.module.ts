import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GameController } from './game.controller';
import { GameAdminController } from './game-admin.controller';
import { GameService } from './game.service';
import { Game, GameSchema } from './schemas/game.schema';
import { Room, RoomSchema } from '../room/schemas/room.schema';

@Module({
  imports: [MongooseModule.forFeature([
    { name: Game.name, schema: GameSchema },
    { name: Room.name, schema: RoomSchema },
  ])],
  controllers: [GameController, GameAdminController],
  providers: [GameService],
  exports: [GameService],
})
export class GameModule {}
