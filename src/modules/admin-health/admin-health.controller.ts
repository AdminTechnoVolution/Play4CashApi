import { Controller, Get, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AdminHealthService } from './admin-health.service';

@Controller('admin/health')
@UseGuards(RolesGuard)
@Roles('admin')
export class AdminHealthController {
  constructor(private readonly health: AdminHealthService) {}

  @Get()
  check() {
    return this.health.check();
  }
}

