import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ContactMessage, ContactMessageSchema } from './schemas/contact-message.schema';
import { ContactUsController } from './contact-us.controller';
import { ContactUsAdminController } from './contact-us-admin.controller';
import { ContactUsService } from './contact-us.service';
import { GameModule } from '../game/game.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: ContactMessage.name, schema: ContactMessageSchema }]),
    GameModule,
  ],
  controllers: [ContactUsController, ContactUsAdminController],
  providers: [ContactUsService],
})
export class ContactUsModule {}
