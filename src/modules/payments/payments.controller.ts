import { Body, Controller, Get, Headers, HttpCode, Param, Post } from '@nestjs/common';
import { IsMongoId, IsString, Length, Matches } from 'class-validator';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { PaymentsService } from './payments.service';
import { LedgerService } from './ledger.service';
class DepositDto {
  @IsString() @Length(2, 30) network: string;
  @IsString() @Matches(/^\d{1,18}(\.\d{1,6})?$/) amount: string;
}
class QuoteDto extends DepositDto {
  @IsString() @Length(10, 200) address: string;
}
class WithdrawalDto { @IsMongoId() quoteId: string; }
class VerifyDto { @IsString() @Matches(/^\d{6}$/) code: string; }
class OrderParams { @IsMongoId() id: string; }
class ReturnRequestDto {
  @IsString() @Length(10, 500) reason: string;
}

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService, private readonly ledger: LedgerService) {}
  @Get('networks') networks() { return this.payments.networkOptions(); }
  @Get('balance') balance(@CurrentUser() user: JwtPayload) { return this.ledger.balances(user.id); }
  @Get('orders') history(@CurrentUser() user: JwtPayload) { return this.payments.history(user.id); }
  @Get('orders/:id') get(@CurrentUser() user: JwtPayload, @Param() params: OrderParams) { return this.payments.get(user.id, params.id); }
  @Post('fund-return-requests') @RateLimit({ limit: 3, ttlMs: 60000 })
  requestReturn(@CurrentUser() user: JwtPayload, @Body() dto: ReturnRequestDto, @Headers('idempotency-key') key: string) {
    return this.payments.requestFundReturn(user.id, key, dto.reason);
  }
  @Post('deposits') @RateLimit({ limit: 10, ttlMs: 60000 })
  deposit(@CurrentUser() user: JwtPayload, @Body() dto: DepositDto, @Headers('idempotency-key') key: string) {
    return this.payments.deposit(user.id, key, dto.network, dto.amount);
  }
  @Post('withdrawal-quotes') @RateLimit({ limit: 10, ttlMs: 60000 })
  quote(@CurrentUser() user: JwtPayload, @Body() dto: QuoteDto) { return this.payments.quote(user.id, dto.network, dto.address, dto.amount); }
  @Post('withdrawals') @RateLimit({ limit: 5, ttlMs: 60000 })
  withdrawal(@CurrentUser() user: JwtPayload, @Body() dto: WithdrawalDto, @Headers('idempotency-key') key: string) {
    return this.payments.requestWithdrawal(user.id, key, dto.quoteId);
  }
  @Post('withdrawals/:id/verify') @RateLimit({ limit: 10, ttlMs: 60000 })
  verify(@CurrentUser() user: JwtPayload, @Param() params: OrderParams, @Body() dto: VerifyDto, @Headers('idempotency-key') key: string) {
    return this.payments.verifyWithdrawal(user.id, params.id, dto.code, key);
  }
  @Public() @Post('ipn/nowpayments') @HttpCode(200)
  ipn(@Body() body: Record<string, unknown>, @Headers('x-nowpayments-sig') signature: string) {
    return this.payments.receiveIpn(body, signature);
  }
}
