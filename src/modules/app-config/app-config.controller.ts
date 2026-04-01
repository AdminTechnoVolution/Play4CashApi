import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppConfigService } from './app-config.service';
import { AdminGuard } from '../../common/guards/admin.guard';

@ApiTags('Config')
@ApiBearerAuth()
@Controller('config')
export class AppConfigController {
  constructor(private readonly appConfigService: AppConfigService) {}

  @Get()
  @ApiOperation({ summary: 'Get global app configuration' })
  getConfig() { return this.appConfigService.getConfig(); }

  @Put()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Admin: update global app configuration' })
  updateConfig(@Body() body: any) { return this.appConfigService.updateConfig(body); }
}
