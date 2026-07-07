"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
const swagger_1 = require("@nestjs/swagger");
const config_1 = require("@nestjs/config");
const auth_service_1 = require("./auth.service");
const i18n_service_1 = require("../../common/i18n/i18n.service");
const public_decorator_1 = require("../../common/decorators/public.decorator");
const login_dto_1 = require("./dto/login.dto");
const refresh_token_dto_1 = require("./dto/refresh-token.dto");
const logout_dto_1 = require("./dto/logout.dto");
const business_exception_1 = require("../../common/exceptions/business.exception");
const auth_cookie_util_1 = require("./auth-cookie.util");
let AuthController = class AuthController {
    authService;
    i18n;
    config;
    constructor(authService, i18n, config) {
        this.authService = authService;
        this.i18n = i18n;
        this.config = config;
    }
    async login(dto, res) {
        const result = await this.authService.loginUser(dto.token);
        const refresh = result?.data?.refreshToken;
        if (refresh) {
            (0, auth_cookie_util_1.setRefreshCookie)(res, this.config, refresh);
        }
        return result;
    }
    async logout(req, res, authHeader, dto, lang) {
        const token = authHeader?.replace('Bearer ', '') || '';
        const cookieName = (0, auth_cookie_util_1.refreshCookieName)(this.config);
        const refreshFromCookie = (0, auth_cookie_util_1.readCookieFromHeader)(req.headers.cookie, cookieName);
        const refreshToken = dto.refreshToken || refreshFromCookie;
        await this.authService.logoutUser(token, refreshToken);
        (0, auth_cookie_util_1.clearRefreshCookie)(res, this.config);
        const message = this.i18n.translate('SUCCESS_LOGOUT', lang);
        return { success: true, messages: [message], data: null };
    }
    async refreshToken(dto, req, res) {
        const cookieName = (0, auth_cookie_util_1.refreshCookieName)(this.config);
        const fromCookie = (0, auth_cookie_util_1.readCookieFromHeader)(req.headers.cookie, cookieName);
        const refresh = dto.refreshToken || fromCookie;
        if (!refresh) {
            throw new business_exception_1.BusinessException('ERROR_AUTH', common_1.HttpStatus.UNAUTHORIZED);
        }
        const result = await this.authService.refreshToken(refresh);
        const newRefresh = result?.data?.refreshToken;
        if (newRefresh) {
            (0, auth_cookie_util_1.setRefreshCookie)(res, this.config, newRefresh);
        }
        return result;
    }
    clearBrowserRefreshCookie(res) {
        (0, auth_cookie_util_1.clearRefreshCookie)(res, this.config);
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, throttler_1.Throttle)({ default: { limit: 40, ttl: 900_000 } }),
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('login'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Login with Google OAuth token' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [login_dto_1.LoginDto, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "login", null);
__decorate([
    (0, common_1.Post)('logout'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiBearerAuth)(),
    (0, swagger_1.ApiOperation)({ summary: 'Logout and revoke tokens' }),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Res)({ passthrough: true })),
    __param(2, (0, common_1.Headers)('authorization')),
    __param(3, (0, common_1.Body)()),
    __param(4, (0, common_1.Headers)('accept-language')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, logout_dto_1.LogoutDto, String]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "logout", null);
__decorate([
    (0, throttler_1.Throttle)({ default: { limit: 60, ttl: 900_000 } }),
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('login/refresh'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({ summary: 'Rotate refresh token to get new access token' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [refresh_token_dto_1.RefreshTokenDto, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "refreshToken", null);
__decorate([
    (0, throttler_1.Throttle)({ default: { limit: 60, ttl: 900_000 } }),
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('login/invalidate-browser-session'),
    (0, common_1.HttpCode)(common_1.HttpStatus.NO_CONTENT),
    (0, swagger_1.ApiOperation)({
        summary: 'Clear httpOnly refresh cookie in the browser (e.g. after client auth failure)',
    }),
    __param(0, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "clearBrowserRefreshCookie", null);
exports.AuthController = AuthController = __decorate([
    (0, swagger_1.ApiTags)('Auth'),
    (0, common_1.Controller)(''),
    __metadata("design:paramtypes", [auth_service_1.AuthService,
        i18n_service_1.I18nService,
        config_1.ConfigService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map