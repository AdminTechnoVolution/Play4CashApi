import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GracePeriod, GracePeriodSchema } from './grace-period.schema';
import { GracePeriodService } from './grace-period.service';

/**
 * Global module so every game gateway (Uno, Chess, Halma, Domino, NavalBattle) can
 * inject `GracePeriodService` without each domain module re-importing the schema.
 *
 * The service registers `@Cron(EVERY_SECOND)` once per replica.
 */
@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: GracePeriod.name, schema: GracePeriodSchema }])],
  providers: [GracePeriodService],
  exports: [GracePeriodService],
})
export class GracePeriodModule {}
