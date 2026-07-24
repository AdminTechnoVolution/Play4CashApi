import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Room, RoomSchema } from '../room/schemas/room.schema';
import { User, UserSchema } from '../user/schemas/user.schema';
import { UserModule } from '../user/user.module';
import { GameAuditController } from './game-audit.controller';
import { GameAuditService } from './game-audit.service';
import {
  GameAuditFinding,
  GameAuditFindingSchema,
  GameAuditReversal,
  GameAuditReversalSchema,
  GameAuditRun,
  GameAuditRunSchema,
} from './schemas/game-audit.schema';

@Module({
  imports: [
    UserModule,
    MongooseModule.forFeature([
      { name: Room.name, schema: RoomSchema },
      { name: User.name, schema: UserSchema },
      { name: GameAuditRun.name, schema: GameAuditRunSchema },
      { name: GameAuditFinding.name, schema: GameAuditFindingSchema },
      { name: GameAuditReversal.name, schema: GameAuditReversalSchema },
    ]),
  ],
  controllers: [GameAuditController],
  providers: [GameAuditService],
})
export class GameAuditModule {}
