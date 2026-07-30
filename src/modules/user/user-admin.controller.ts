import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminRoute } from '../../common/decorators/admin-route.decorator';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard';
import { UserService } from './user.service';

@Controller('admin/metrics')
@AdminRoute()
@UseGuards(AdminAuthGuard)
export class UserAdminController {
  constructor(private readonly users: UserService) {}

  @Get('platform-totals')
  getPlatformTotals() {
    return this.users.getTotalBalances();
  }
}
