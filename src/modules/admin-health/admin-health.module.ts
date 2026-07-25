import { Module } from '@nestjs/common';
import { WebsocketsModule } from '../websockets/websockets.module';
import { AdminHealthController } from './admin-health.controller';
import { AdminHealthService } from './admin-health.service';

@Module({
  imports: [WebsocketsModule],
  controllers: [AdminHealthController],
  providers: [AdminHealthService],
})
export class AdminHealthModule {}

