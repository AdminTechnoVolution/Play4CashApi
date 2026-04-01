import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WalletService } from './wallet.service';
import { AdminGuard } from '../../common/guards/admin.guard';

@ApiTags('Wallets')
@ApiBearerAuth()
@Controller('wallets')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  @ApiOperation({ summary: 'List active platform wallets' })
  findAll() { return this.walletService.findAll(); }

  @Post()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Admin: create wallet' })
  create(@Body() body: any) { return this.walletService.create(body); }

  @Put(':id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Admin: update wallet' })
  update(@Param('id') id: string, @Body() body: any) { return this.walletService.update(id, body); }

  @Delete(':id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Admin: delete wallet' })
  async remove(@Param('id') id: string) {
    await this.walletService.delete(id);
    return { success: true, messages: ['SUCCESS_DELETE'], data: null };
  }
}
