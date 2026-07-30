import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminRoute } from '../../common/decorators/admin-route.decorator';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard';
import { AdminHealthService } from './admin-health.service';

@Controller('admin/health')
@AdminRoute()
@UseGuards(AdminAuthGuard)
export class AdminHealthController {
  constructor(private readonly health: AdminHealthService) {}

  @Get()
  check() {
    return this.health.check();
  }
}
