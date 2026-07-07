import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { I18nService } from '../../common/i18n/i18n.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { LogoutDto } from './dto/logout.dto';
export declare class AuthController {
    private readonly authService;
    private readonly i18n;
    private readonly config;
    constructor(authService: AuthService, i18n: I18nService, config: ConfigService);
    login(dto: LoginDto, res: Response): Promise<any>;
    logout(req: Request, res: Response, authHeader: string, dto: LogoutDto, lang: string): Promise<{
        success: boolean;
        messages: string[];
        data: null;
    }>;
    refreshToken(dto: RefreshTokenDto, req: Request, res: Response): Promise<any>;
    clearBrowserRefreshCookie(res: Response): void;
}
