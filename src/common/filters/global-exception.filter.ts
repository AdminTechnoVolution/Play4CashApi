import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { BusinessException } from '../exceptions/business.exception';
import { I18nService } from '../i18n/i18n.service';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  constructor(private readonly i18n: I18nService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const lang = (request.headers['accept-language'] as string) || 'en';

    // Known business / HTTP exceptions — safe to expose the message key
    if (exception instanceof BusinessException) {
      const message = this.i18n.translate(exception.message, lang);
      response.status(exception.statusCode).json({
        success: false,
        messages: [message],
        data: null,
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const messages =
        typeof body === 'object' && (body as any).message
          ? Array.isArray((body as any).message)
            ? (body as any).message.map((m: any) => this.i18n.translate(m, lang))
            : [this.i18n.translate((body as any).message, lang)]
          : [this.i18n.translate(exception.message, lang)];

      response.status(status).json({ success: false, messages, data: null });
      return;
    }

    // Unhandled error — NEVER expose raw message to client
    const message = this.i18n.translate('ERROR_GENERIC_RESPONSE', lang);
    console.error('[GlobalExceptionFilter] Unhandled exception:', exception);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      messages: [message],
      data: null,
    });
  }
}
