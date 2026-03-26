import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { I18nService } from '../../common/i18n/i18n.service';
import { Public } from '../../common/decorators/public.decorator';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';

@ApiTags('Auth')
@Controller('') // prefix from main.ts: /api
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly i18n: I18nService,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with Google OAuth token' })
  async login(@Body() dto: LoginDto) {
    return this.authService.loginUser(dto.token);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout and revoke tokens' })
  async logout(
    @Headers('authorization') authHeader: string,
    @Body() dto: LogoutDto,
    @Headers('accept-language') lang: string,
  ) {
    const token = authHeader?.replace('Bearer ', '') || '';
    await this.authService.logoutUser(token, dto.refreshToken);
    const message = this.i18n.translate('SUCCESS_LOGOUT', lang);
    return { success: true, messages: [message], data: null };
  }

  @Public()
  @Post('login/refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate refresh token to get new access token' })
  async refreshToken(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto.refreshToken);
  }
}
