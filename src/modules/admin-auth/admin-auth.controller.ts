import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { AdminRoute } from '../../common/decorators/admin-route.decorator';
import { RateLimit } from '../../common/rate-limit/rate-limit.decorator';
import { LoginDto } from '../auth/dto/login.dto';
import { LogoutDto } from '../auth/dto/logout.dto';
import { RefreshTokenDto } from '../auth/dto/refresh-token.dto';
import { AdminAuthGuard } from './admin-auth.guard';
import {
  ADMIN_ACCESS_COOKIE,
  ADMIN_REFRESH_COOKIE,
  clearAdminCookies,
  readNamedCookie,
  setAdminCookies,
} from './admin-auth-cookie.util';
import { AdminAuthService } from './admin-auth.service';
import { BusinessException } from '../../common/exceptions/business.exception';

@Controller('admin/auth')
@AdminRoute()
@UseGuards(AdminAuthGuard)
export class AdminAuthController {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @RateLimit({ limit: 20, ttlMs: 900_000 })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: Response) {
    const data = await this.auth.login(dto.token);
    setAdminCookies(response, this.config, data.token, data.refreshToken);
    return { success: true, messages: [], data };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const token = dto.refreshToken
      || readNamedCookie(request.headers.cookie, ADMIN_REFRESH_COOKIE);
    if (!token) throw new BusinessException('ERROR_AUTH', 401);
    const data = await this.auth.refresh(token);
    setAdminCookies(response, this.config, data.token, data.refreshToken);
    return { success: true, messages: [], data };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Headers('authorization') authorization: string,
    @Body() dto: LogoutDto,
  ) {
    const access = authorization?.replace(/^Bearer\s+/i, '')
      || readNamedCookie(request.headers.cookie, ADMIN_ACCESS_COOKIE);
    const refresh = dto.refreshToken
      || readNamedCookie(request.headers.cookie, ADMIN_REFRESH_COOKIE);
    await this.auth.logout(access, refresh);
    clearAdminCookies(response, this.config);
    return { success: true, messages: [], data: null };
  }

  @Public()
  @Post('invalidate-browser-session')
  @HttpCode(HttpStatus.NO_CONTENT)
  invalidate(@Res({ passthrough: true }) response: Response): void {
    clearAdminCookies(response, this.config);
  }

  @Get('me')
  async me(@CurrentUser() admin: JwtPayload) {
    return this.auth.profile(admin.id);
  }
}
