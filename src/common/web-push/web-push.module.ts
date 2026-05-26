import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../../modules/user/schemas/user.schema';
import { WebPushService } from './web-push.service';

@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])],
  providers: [WebPushService],
  exports: [WebPushService],
})
export class WebPushModule {}
