import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RechargeService } from './recharge.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { I18nService } from '../../common/i18n/i18n.service';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
import { ConfigService } from '@nestjs/config';
import { IsNumber, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

class CreateRechargeDto {
  @ApiProperty() @IsString() txId: string;
  @ApiProperty() @IsString() coin: string;
  @ApiProperty() @IsNumber() amount: number;
}

@ApiTags('Recharges')
@ApiBearerAuth()
@Controller('transactions')
export class RechargeController {
  constructor(
    private readonly rechargeService: RechargeService,
    private readonly config: ConfigService,
    private readonly i18n: I18nService,
  ) {}

  @Post('recharge')
  @ApiOperation({ summary: 'Submit a deposit transaction for confirmation' })
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateRechargeDto,
    @Headers('accept-language') lang: string,
  ) {
    const expiryMins = this.config.get<number>('withdrawal.processingExpiryMinutes') || 30;
    const result = await this.rechargeService.createRecharge(user.id, dto.txId, dto.coin, dto.amount, expiryMins);
    const message = this.i18n.translate('SUCCESS_RECHARGE', lang);
    return { success: true, messages: [message], data: result };
  }

  @Get('recharge/history')
  @ApiOperation({ summary: 'Get recharge history for current user' })
  getHistory(@CurrentUser() user: JwtPayload) {
    return this.rechargeService.getHistory(user.id);
  }
}
