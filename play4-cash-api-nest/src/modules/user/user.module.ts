import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { UserRepository } from './user.repository';
import { User, UserSchema } from './schemas/user.schema';
import { AppConfig, AppConfigSchema } from '../app-config/schemas/app-config.schema';
import { Room, RoomSchema } from '../room/schemas/room.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: AppConfig.name, schema: AppConfigSchema },
      { name: Room.name, schema: RoomSchema },
    ]),
  ],
  controllers: [UserController],
  providers: [UserService, UserRepository],
  exports: [UserService, UserRepository],
})
export class UserModule {}
