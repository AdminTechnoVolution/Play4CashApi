import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { I18nService } from '../../common/i18n/i18n.service';
import { Public } from '../../common/decorators/public.decorator';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';
import { FakeLoginDto } from './dto/fake-login.dto';
import { BusinessException } from '../../common/exceptions/business.exception';
import {
  clearRefreshCookie,
  clearAccessCookie,
  readCookieFromHeader,
  refreshCookieName,
  accessCookieName,
  setRefreshCookie,
  setAccessCookie,
} from './auth-cookie.util';

@ApiTags('Auth')
@Controller('') // prefix from main.ts: /api
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly i18n: I18nService,
    private readonly config: ConfigService,
  ) {}

  @RateLimit({ limit: 40, ttlMs: 900_000 })
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with Google OAuth token' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.loginUser(dto.token);
    const access = result?.data?.token;
    const refresh = result?.data?.refreshToken;
    if (access) {
      setAccessCookie(res, this.config, access);
    }
    if (refresh) {
      setRefreshCookie(res, this.config, refresh);
    }
    return result;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout and revoke tokens' })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Headers('authorization') authHeader: string,
    @Body() dto: LogoutDto,
    @Headers('accept-language') lang: string,
  ) {
    const token = authHeader?.replace('Bearer ', '') || '';
    const accessFromCookie = readCookieFromHeader(req.headers.cookie, accessCookieName(this.config));
    const cookieName = refreshCookieName(this.config);
    const refreshFromCookie = readCookieFromHeader(req.headers.cookie, cookieName);
    const refreshToken = dto.refreshToken || refreshFromCookie;
    await this.authService.logoutUser(token || accessFromCookie || '', refreshToken);
    clearAccessCookie(res, this.config);
    clearRefreshCookie(res, this.config);
    const message = this.i18n.translate('SUCCESS_LOGOUT', lang);
    return { success: true, messages: [message], data: null };
  }

  @Public()
  @Post('login/refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate refresh token to get new access token' })
  async refreshToken(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookieName = refreshCookieName(this.config);
    const fromCookie = readCookieFromHeader(req.headers.cookie, cookieName);
    const refresh = dto.refreshToken || fromCookie;
    if (!refresh) {
      throw new BusinessException('ERROR_AUTH', HttpStatus.UNAUTHORIZED);
    }
    const result = await this.authService.refreshToken(refresh);
    const access = result?.data?.token;
    const newRefresh = result?.data?.refreshToken;
    if (access) {
      setAccessCookie(res, this.config, access);
    }
    if (newRefresh) {
      setRefreshCookie(res, this.config, newRefresh);
    }
    return result;
  }

  // Test-only login bypass — gated by config.auth.fakeLoginEnabled (see
  // configuration.ts: requires ENABLE_FAKE_LOGIN=true AND NODE_ENV !== production).
  // Returns 404 when disabled so it's indistinguishable from a route that doesn't
  // exist at all; never leaks "this feature exists but is off" to a prod probe.
  @RateLimit({ limit: 30, ttlMs: 900_000 })
  @Public()
  @Post('login/fake')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Test only] Login without Google OAuth — disabled unless explicitly enabled' })
  async fakeLogin(@Body() dto: FakeLoginDto, @Res({ passthrough: true }) res: Response) {
    if (!this.config.get<boolean>('auth.fakeLoginEnabled')) {
      throw new NotFoundException();
    }
    const result = await this.authService.fakeLogin(dto.email, dto.name);
    const access = result?.data?.token;
    const refresh = result?.data?.refreshToken;
    if (access) {
      setAccessCookie(res, this.config, access);
    }
    if (refresh) {
      setRefreshCookie(res, this.config, refresh);
    }
    return result;
  }

  @Public()
  @Post('login/invalidate-browser-session')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Clear httpOnly refresh cookie in the browser (e.g. after client auth failure)',
  })
  clearBrowserRefreshCookie(@Res({ passthrough: true }) res: Response): void {
    clearAccessCookie(res, this.config);
    clearRefreshCookie(res, this.config);
  }
}
