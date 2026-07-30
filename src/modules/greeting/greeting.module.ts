import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GreetingController } from './greeting.controller';
import { GreetingService } from './greeting.service';
import { Greeting, GreetingSchema } from './schemas/greeting.schema';
import { GreetingAdminController } from './greeting-admin.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: Greeting.name, schema: GreetingSchema }])],
  controllers: [GreetingController, GreetingAdminController],
  providers: [GreetingService],
  exports: [GreetingService],
})
export class GreetingModule {}
