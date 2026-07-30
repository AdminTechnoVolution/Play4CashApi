import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { AdminRoute } from '../../common/decorators/admin-route.decorator';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard';
import { WalletService } from './wallet.service';

@Controller('admin/wallets')
@AdminRoute()
@UseGuards(AdminAuthGuard)
export class WalletAdminController {
  constructor(private readonly wallets: WalletService) {}

  @Get()
  findAll() {
    return this.wallets.findAll();
  }

  @Post()
  create(@Body() body: unknown) {
    return this.wallets.create(body as any);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: unknown) {
    return this.wallets.update(id, body as any);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.wallets.delete(id);
    return { success: true, messages: ['SUCCESS_DELETE'], data: null };
  }
}
