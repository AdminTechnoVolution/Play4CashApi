import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Room, RoomSchema } from '../room/schemas/room.schema';
import { User, UserSchema } from '../user/schemas/user.schema';
import { HouseTreasuryController } from './house-treasury.controller';
import { HouseTreasuryService } from './house-treasury.service';
import { HouseLedger, HouseLedgerSchema } from './schemas/house-ledger.schema';
import { HouseWithdrawal, HouseWithdrawalSchema } from './schemas/house-withdrawal.schema';
import {
  HouseTreasuryConfig,
  HouseTreasuryConfigSchema,
} from './schemas/house-treasury-config.schema';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: HouseLedger.name, schema: HouseLedgerSchema },
      { name: HouseWithdrawal.name, schema: HouseWithdrawalSchema },
      { name: HouseTreasuryConfig.name, schema: HouseTreasuryConfigSchema },
      { name: Room.name, schema: RoomSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [HouseTreasuryController],
  providers: [HouseTreasuryService],
  exports: [HouseTreasuryService],
})
export class HouseTreasuryModule {}

