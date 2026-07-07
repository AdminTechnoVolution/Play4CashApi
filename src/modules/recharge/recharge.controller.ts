import { BadRequestException, Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RechargeService } from './recharge.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { I18nService } from '../../common/i18n/i18n.service';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
import { ConfigService } from '@nestjs/config';
import { IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';

class CreateRechargeDto {
  @ApiProperty() @IsString() txId: string;
  @ApiProperty() @IsString() coin: string;
}

@ApiTags('Recharges')
@ApiBearerAuth()
@Controller('transactions')
export class RechargeController {
  private static readonly UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  constructor(
    private readonly rechargeService: RechargeService,
    private readonly config: ConfigService,
    private readonly i18n: I18nService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post('recharge')
  @ApiOperation({ summary: 'Submit a deposit transaction for confirmation' })
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateRechargeDto,
    @Headers('accept-language') lang: string,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const idempKey = this.assertIdempotencyKey(idempotencyKey);
    const expiryMins = this.config.get<number>('withdrawal.processingExpiryMinutes') || 30;
    const cacheKey = `idem:recharge:create:${user.id}:${idempKey}`;
    const result = await this.idempotency.getOrSet(cacheKey, IdempotencyService.DEFAULT_TTL_SEC, () =>
      this.rechargeService.createRecharge(user.id, dto.txId, dto.coin, expiryMins),
    );
    const message = this.i18n.translate('SUCCESS_RECHARGE', lang);
    return { success: true, messages: [message], data: result };
  }

  @Get('recharge/history')
  @ApiOperation({ summary: 'Get recharge history for current user' })
  getHistory(@CurrentUser() user: JwtPayload) {
    return this.rechargeService.getHistory(user.id);
  }

  private assertIdempotencyKey(idempotencyKey: string | undefined): string {
    const trimmed = idempotencyKey?.trim();
    if (!trimmed || !RechargeController.UUID_RE.test(trimmed)) {
      throw new BadRequestException('Valid Idempotency-Key header required');
    }
    return trimmed;
  }
}
