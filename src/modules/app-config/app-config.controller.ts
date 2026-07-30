import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppConfigService } from './app-config.service';

@ApiTags('Config')
@ApiBearerAuth()
@Controller('config')
export class AppConfigController {
  constructor(private readonly appConfigService: AppConfigService) {}

  @Get()
  @ApiOperation({ summary: 'Get global app configuration' })
  getConfig() { return this.appConfigService.getConfig(); }
}
