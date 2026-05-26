import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TurnDeadline, TurnDeadlineSchema } from './turn-deadline.schema';
import { TurnDeadlineService } from './turn-deadline.service';

@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: TurnDeadline.name, schema: TurnDeadlineSchema }])],
  providers: [TurnDeadlineService],
  exports: [TurnDeadlineService],
})
export class TurnDeadlineModule {}
