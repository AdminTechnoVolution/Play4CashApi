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
Object.defineProperty(exports, "__esModule", { value: true });
exports.GlobalExceptionFilter = void 0;
const common_1 = require("@nestjs/common");
const business_exception_1 = require("../exceptions/business.exception");
const i18n_service_1 = require("../i18n/i18n.service");
let GlobalExceptionFilter = class GlobalExceptionFilter {
    i18n;
    constructor(i18n) {
        this.i18n = i18n;
    }
    catch(exception, host) {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse();
        const request = ctx.getRequest();
        const lang = request.headers['accept-language'] || 'en';
        if (exception instanceof business_exception_1.BusinessException) {
            const message = this.i18n.translate(exception.message, lang);
            response.status(exception.statusCode).json({
                success: false,
                messages: [message],
                data: exception.data ?? null,
            });
            return;
        }
        if (exception instanceof common_1.HttpException) {
            const status = exception.getStatus();
            const body = exception.getResponse();
            const messages = typeof body === 'object' && body.message
                ? Array.isArray(body.message)
                    ? body.message.map((m) => this.i18n.translate(m, lang))
                    : [this.i18n.translate(body.message, lang)]
                : [this.i18n.translate(exception.message, lang)];
            response.status(status).json({ success: false, messages, data: null });
            return;
        }
        const message = this.i18n.translate('ERROR_GENERIC_RESPONSE', lang);
        console.error(`[GlobalExceptionFilter] Unhandled exception ON [${request.method}] ${request.url}:`, exception);
        response.status(common_1.HttpStatus.INTERNAL_SERVER_ERROR).json({
            success: false,
            messages: [message],
            data: null,
        });
    }
};
exports.GlobalExceptionFilter = GlobalExceptionFilter;
exports.GlobalExceptionFilter = GlobalExceptionFilter = __decorate([
    (0, common_1.Catch)(),
    __metadata("design:paramtypes", [i18n_service_1.I18nService])
], GlobalExceptionFilter);
//# sourceMappingURL=global-exception.filter.js.map