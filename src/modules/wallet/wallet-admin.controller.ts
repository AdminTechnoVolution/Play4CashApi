import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { AdminRoute } from '../../common/decorators/admin-route.decorator';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard';
import { WalletService } from './wallet.service';

export class CreateWalletDto {
  @ApiProperty() @IsString() @MinLength(1) coin: string;
  @ApiProperty() @IsString() @MinLength(1) address: string;
  @ApiProperty({ description: 'Network (e.g. TRC20, BEP20)' }) @IsString() @MinLength(1) red: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() description?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() @Min(0) minAmount?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() @Min(0) networkWithdrawalFee?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateWalletDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MinLength(1) coin?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MinLength(1) address?: string;
  @ApiProperty({ required: false, description: 'Network (e.g. TRC20, BEP20)' })
  @IsOptional() @IsString() @MinLength(1) red?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() description?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() @Min(0) minAmount?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() @Min(0) networkWithdrawalFee?: number;
  @ApiProperty({ required: false }) @IsOptional() @IsBoolean() isActive?: boolean;
}

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
  create(@Body() body: CreateWalletDto) {
    return this.wallets.create(body);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: UpdateWalletDto) {
    return this.wallets.update(id, body);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.wallets.delete(id);
    return { success: true, messages: ['SUCCESS_DELETE'], data: null };
  }
}
