import { Module } from '@nestjs/common';
import { AdminSandboxController } from './admin-sandbox.controller';

@Module({
  controllers: [AdminSandboxController],
})
export class AdminSandboxModule {}
