import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Post, Put, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserService } from './user.service';
import { AdminGuard } from '../../common/guards/admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { I18nService } from '../../common/i18n/i18n.service';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

class RegisterWalletDto {
  @ApiProperty() @IsString() coin: string;
  @ApiProperty() @IsString() network: string;
  @ApiProperty() @IsString() wallet: string;
}

class UpdateProfileDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MinLength(3) @MaxLength(20) username?: string;
}

class RegisterUserDto {
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(20) username: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() referred_by?: string;
}

class VerifyCodeDto {
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsString() verification_code: string;
}

class ConfirmWalletOtpDto {
  @ApiProperty()
  @IsString()
  @MinLength(4)
  @MaxLength(12)
  verification_code: string;
}

class PushSubscriptionDto {
  @ApiProperty() @IsString() endpoint: string;
  @ApiProperty() @IsString() p256dh: string;
  @ApiProperty() @IsString() auth: string;
}

class RemovePushSubscriptionDto {
  @ApiProperty() @IsString() endpoint: string;
}

@ApiTags('User')
@ApiBearerAuth()
@Controller('user')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly i18n: I18nService,
    private readonly config: ConfigService,
  ) {}

  // GET /api/user/admin/total-balances  (must come before /:id routes)
  @Get('admin/total-balances')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Admin: get total platform balances' })
  getTotalBalances() {
    return this.userService.getTotalBalances();
  }

  // GET /api/user/public/stats — login / marketing (no auth)
  @Public()
  @Get('public/stats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Public: registered user count (rate-limited globally)' })
  getPublicStats() {
    return this.userService.getPublicUserStats();
  }

  // GET /api/user/account
  @Get('account')
  @ApiOperation({ summary: 'Get authenticated user account' })
  getAccount(@CurrentUser() user: JwtPayload) {
    return this.userService.getProfile(user.id);
  }

  // GET /api/user/history
  @Get('history')
  @ApiOperation({ summary: 'Get authenticated user game history' })
  getHistory(
    @CurrentUser() user: JwtPayload,
    @Headers('accept-language') lang: string,
  ) {
    return this.userService.getHistory(user.id, lang || 'en');
  }

  // POST /api/user/register  (public)
  @RateLimit({ limit: 20, ttlMs: 900_000 })
  @Public()
  @Post('register')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Register a new user account' })
  register(@Body() dto: RegisterUserDto) {
    return this.userService.registerUser(dto.email, dto.username, dto.referred_by);
  }

  // POST /api/user/request-wallet-change
  @RateLimit({ limit: 15, ttlMs: 900_000 })
  @Post('request-wallet-change')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request wallet update (sends OTP to email)' })
  async requestWalletChange(
    @CurrentUser() user: JwtPayload,
    @Body() dto: RegisterWalletDto,
    @Headers('accept-language') lang: string,
  ) {
    const expiryMins = this.config.get<number>('withdrawal.verificationExpiryMinutes') || 30;
    await this.userService.requestWalletChange(
      user.id,
      dto.coin,
      dto.network,
      dto.wallet,
      expiryMins,
      lang || 'en',
    );
    const message = this.i18n.translate('SUCCESS_WALLET_CHANGE_OTP_SENT', lang);
    return { success: true, messages: [message], data: null };
  }

  // POST /api/user/confirm-wallet-change
  @Post('confirm-wallet-change')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Confirm wallet update with email verification code' })
  async confirmWalletChange(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ConfirmWalletOtpDto,
    @Headers('accept-language') lang: string,
  ) {
    await this.userService.confirmWalletChangeWithOtp(user.id, dto.verification_code);
    const message = this.i18n.translate('SUCCESS_WALLET_CHANGE_CONFIRMED', lang);
    return { success: true, messages: [message], data: null };
  }

  // POST /api/user/verify-code  (public)
  @RateLimit({ limit: 30, ttlMs: 900_000 })
  @Public()
  @Post('verify-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email code to activate account' })
  verifyCode(@Body() dto: VerifyCodeDto) {
    return this.userService.verifyCode(dto.email, dto.verification_code);
  }

  // PUT /api/user/profile  (kept for backward compat)
  @Put('profile')
  @ApiOperation({ summary: 'Update user profile' })
  updateProfile(@CurrentUser() user: JwtPayload, @Body() dto: UpdateProfileDto) {
    return this.userService.updateProfile(user.id, dto);
  }

  @Post('push-subscription')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Register Web Push subscription for background alerts' })
  async savePushSubscription(@CurrentUser() user: JwtPayload, @Body() dto: PushSubscriptionDto) {
    await this.userService.savePushSubscription(user.id, {
      endpoint: dto.endpoint,
      keys: { p256dh: dto.p256dh, auth: dto.auth },
    });
    return { success: true, messages: [], data: { saved: true } };
  }

  @Post('push-subscription/remove')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove Web Push subscription' })
  async removePushSubscription(@CurrentUser() user: JwtPayload, @Body() dto: RemovePushSubscriptionDto) {
    await this.userService.removePushSubscription(user.id, dto.endpoint);
    return { success: true, messages: [], data: { removed: true } };
  }
}
