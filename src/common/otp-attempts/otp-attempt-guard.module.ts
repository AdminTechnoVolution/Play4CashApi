import { Global, Module } from '@nestjs/common';
import { OtpAttemptGuardService } from './otp-attempt-guard.service';
import { RedisModule } from '../redis/redis.module';

@Global()
@Module({
  imports: [RedisModule],
  providers: [OtpAttemptGuardService],
  exports: [OtpAttemptGuardService],
})
export class OtpAttemptGuardModule {}
