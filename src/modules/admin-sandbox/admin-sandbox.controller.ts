import { Controller, Get, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ADMIN_SANDBOX_ENDPOINTS } from './admin-sandbox.catalog';

@Controller('admin/sandbox')
@UseGuards(RolesGuard)
@Roles('admin')
export class AdminSandboxController {
  @Get('endpoints')
  getEndpoints() {
    return {
      read_only: true,
      generated_at: new Date().toISOString(),
      endpoints: ADMIN_SANDBOX_ENDPOINTS,
    };
  }
}
