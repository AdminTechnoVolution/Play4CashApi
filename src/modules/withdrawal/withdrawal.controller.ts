import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { WithdrawalService } from './withdrawal.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
import { ConfigService } from '@nestjs/config';
import { I18nService } from '../../common/i18n/i18n.service';
import { IsNumber, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

class InitiateWithdrawalDto {
  @ApiProperty() @IsNumber() amount: number;
}

class VerifyWithdrawalDto {
  @ApiProperty() @IsString() verification_code: string;
}

@ApiTags('Withdrawals')
@ApiBearerAuth()
@Controller('transactions')
export class WithdrawalController {
  constructor(
    private readonly withdrawalService: WithdrawalService,
    private readonly config: ConfigService,
    private readonly i18n: I18nService,
  ) {}

  @Post('withdrawal')
  @ApiOperation({ summary: 'Initiate a withdrawal (sends verification code)' })
  async initiate(
    @CurrentUser() user: JwtPayload,
    @Body() dto: InitiateWithdrawalDto,
    @Headers('accept-language') lang: string,
  ) {
    const expiryMins = this.config.get<number>('withdrawal.verificationExpiryMinutes') || 30;
    await this.withdrawalService.initiateWithdrawal(user.id, dto.amount, expiryMins, lang || 'en');
    const message = this.i18n.translate('SUCCESS_WITHDRAWAL_CREATED', lang);
    return { success: true, messages: [message], data: null };
  }

  @Post('verify-withdrawal')
  @ApiOperation({ summary: 'Confirm withdrawal with verification code' })
  async verify(
    @CurrentUser() user: JwtPayload,
    @Body() dto: VerifyWithdrawalDto,
    @Headers('accept-language') lang: string,
  ) {
    const result = await this.withdrawalService.processWithdrawal(user.id, dto.verification_code);
    const message = this.i18n.translate('SUCCESS_WITHDRAWAL_VERIFY', lang);
    return { success: true, messages: [message], data: result };
  }

  @Get('withdrawal/history')
  @ApiOperation({ summary: 'Get withdrawal history for current user' })
  getHistory(@CurrentUser() user: JwtPayload) {
    return this.withdrawalService.getHistory(user.id);
  }
}
