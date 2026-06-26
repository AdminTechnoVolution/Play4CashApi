import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { UserRepository } from './user.repository';
import { User, UserSchema } from './schemas/user.schema';
import { WalletChangePending, WalletChangePendingSchema } from './schemas/wallet-change-pending.schema';
import { Room, RoomSchema } from '../room/schemas/room.schema';
import { WalletModule } from '../wallet/wallet.module';
import { AppConfigModule } from '../app-config/app-config.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: WalletChangePending.name, schema: WalletChangePendingSchema },
      { name: Room.name, schema: RoomSchema },
    ]),
    WalletModule,
    AppConfigModule,
  ],
  controllers: [UserController],
  providers: [UserService, UserRepository],
  exports: [UserService, UserRepository],
})
export class UserModule {}
