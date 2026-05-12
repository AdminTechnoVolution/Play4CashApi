import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AppVersionStatsService, AppVersionStatsSummary } from './app-version-stats.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';

@ApiTags('Admin · App Version')
@ApiBearerAuth()
@Controller('admin/app-versions')
@UseGuards(RolesGuard)
@Roles('admin')
export class AppVersionController {
  constructor(private readonly stats: AppVersionStatsService) {}

  @Get('stats')
  // 30 calls/min is plenty for an admin dashboard and protects Redis from accidental tight loops.
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @ApiOperation({
    summary: 'Distribution of `X-App-Version` headers across the last N days (sampled).',
  })
  @ApiQuery({ name: 'days', required: false, type: Number, description: '1..60 (default 7)' })
  async getStats(
    @Query('days', new ParseIntPipe({ optional: true })) days?: number,
  ): Promise<AppVersionStatsSummary> {
    const summary = await this.stats.getStats(days ?? 7);
    // When every bucket failed Redis reads return 503 so dashboards can flag the outage
    // instead of silently rendering an empty chart.
    if (summary.degraded && summary.daily.every((d) => Object.keys(d.versions).length === 0)) {
      throw new HttpException(
        { message: 'Stats backend unavailable', summary },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return summary;
  }
}
