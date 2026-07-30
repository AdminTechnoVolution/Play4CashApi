import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
import { AdminRoute } from '../../common/decorators/admin-route.decorator';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard';
import {
  CreateHouseAdjustmentDto,
  CreateHouseWithdrawalDto,
  HouseLedgerQueryDto,
} from './dtos/house-treasury.dto';
import { HouseTreasuryService } from './house-treasury.service';

@Controller('admin/house-treasury')
@AdminRoute()
@UseGuards(AdminAuthGuard)
export class HouseTreasuryController {
  constructor(private readonly treasury: HouseTreasuryService) {}

  @Get('summary')
  summary(@Query('refresh_binance') refresh?: string) {
    return this.treasury.getSummary(refresh === 'true');
  }

  @Get('ledger')
  list(@Query() query: HouseLedgerQueryDto) {
    return this.treasury.list(query);
  }

  @Get('ledger/:id')
  detail(@Param('id') id: string) {
    return this.treasury.getById(id);
  }

  @Post('withdrawals')
  withdrawal(
    @Body() dto: CreateHouseWithdrawalDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.treasury.createWithdrawal(dto, user.id);
  }

  @Post('adjustments')
  adjustment(
    @Body() dto: CreateHouseAdjustmentDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.treasury.createAdjustment(dto, user.id);
  }
}
