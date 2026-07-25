import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional } from 'class-validator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { RechargeService } from './recharge.service';
import type { DepositTrafficPeriod } from './recharge.service';

class DepositTrafficQueryDto {
  @IsOptional()
  @IsIn(['7d', '30d', '90d'])
  period: DepositTrafficPeriod = '7d';
}

@Controller('admin/dashboard/deposits')
@UseGuards(RolesGuard)
@Roles('admin')
export class RechargeAdminController {
  constructor(private readonly rechargeService: RechargeService) {}

  @Get()
  getTraffic(@Query() query: DepositTrafficQueryDto) {
    return this.rechargeService.getDepositTraffic(query.period);
  }
}
