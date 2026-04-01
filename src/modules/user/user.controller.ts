import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserService } from './user.service';
import { AdminGuard } from '../../common/guards/admin.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { I18nService } from '../../common/i18n/i18n.service';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

class RegisterWalletDto {
  @ApiProperty() @IsString() coin: string;
  @ApiProperty() @IsString() network: string;
  @ApiProperty() @IsString() wallet: string;
}

class UpdateProfileDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MinLength(3) username?: string;
}

class RegisterUserDto {
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsString() @MinLength(3) username: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() referred_by?: string;
}

class VerifyCodeDto {
  @ApiProperty() @IsEmail() email: string;
  @ApiProperty() @IsString() verification_code: string;
}

@ApiTags('User')
@ApiBearerAuth()
@Controller('user')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly i18n: I18nService,
  ) {}

  // GET /api/user/admin/total-balances  (must come before /:id routes)
  @Get('admin/total-balances')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Admin: get total platform balances' })
  getTotalBalances() {
    return this.userService.getTotalBalances();
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
  @Public()
  @Post('register')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Register a new user account' })
  register(@Body() dto: RegisterUserDto) {
    return this.userService.registerUser(dto.email, dto.username, dto.referred_by);
  }

  // POST /api/user/register-wallet
  @Post('register-wallet')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Register or update wallet address' })
  async registerWallet(
    @CurrentUser() user: JwtPayload,
    @Body() dto: RegisterWalletDto,
    @Headers('accept-language') lang: string,
  ) {
    await this.userService.registerWallet(user.id, dto.coin, dto.network, dto.wallet);
    const message = this.i18n.translate('SUCCESS_REGISTER_WALLET', lang);
    return { success: true, messages: [message], data: null };
  }

  // POST /api/user/verify-code  (public)
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
}
