import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminRoute } from '../../common/decorators/admin-route.decorator';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard';
import { ADMIN_SANDBOX_ENDPOINTS } from './admin-sandbox.catalog';

@Controller('admin/sandbox')
@AdminRoute()
@UseGuards(AdminAuthGuard)
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
