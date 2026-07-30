import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { AdminRoute } from '../../common/decorators/admin-route.decorator';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard';
import { AppConfigService } from './app-config.service';

@Controller('admin/config')
@AdminRoute()
@UseGuards(AdminAuthGuard)
export class AppConfigAdminController {
  constructor(private readonly config: AppConfigService) {}

  @Get()
  getConfig() {
    return this.config.getConfig();
  }

  @Put()
  updateConfig(@Body() body: { withdrawal_daily_limit: number }) {
    return this.config.updateConfig(body);
  }
}
