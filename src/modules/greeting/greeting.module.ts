import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GreetingController } from './greeting.controller';
import { GreetingService } from './greeting.service';
import { Greeting, GreetingSchema } from './schemas/greeting.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: Greeting.name, schema: GreetingSchema }])],
  controllers: [GreetingController],
  providers: [GreetingService],
  exports: [GreetingService],
})
export class GreetingModule {}
