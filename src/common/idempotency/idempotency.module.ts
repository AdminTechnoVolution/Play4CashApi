import { Global, Module } from '@nestjs/common';
import { IdempotencyService } from './idempotency.service';
import { RedisModule } from '../redis/redis.module';

/** Phase C: Redis is provided globally already, but we wrap the helper in its own
 *  module so we can swap the backing store later without ripping out imports. */
@Global()
@Module({
  imports: [RedisModule],
  providers: [IdempotencyService],
  exports: [IdempotencyService],
})
export class IdempotencyModule {}
