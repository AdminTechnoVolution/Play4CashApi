import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional } from 'class-validator';
import { AdminRoute } from '../../common/decorators/admin-route.decorator';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard';
import { RechargeService } from './recharge.service';
import type { DepositTrafficPeriod } from './recharge.service';

class DepositTrafficQueryDto {
  @IsOptional()
  @IsIn(['7d', '30d', '90d'])
  period: DepositTrafficPeriod = '7d';
}

@Controller('admin/dashboard/deposits')
@AdminRoute()
@UseGuards(AdminAuthGuard)
export class RechargeAdminController {
  constructor(private readonly rechargeService: RechargeService) {}

  @Get()
  getTraffic(@Query() query: DepositTrafficQueryDto) {
    return this.rechargeService.getDepositTraffic(query.period);
  }
}
