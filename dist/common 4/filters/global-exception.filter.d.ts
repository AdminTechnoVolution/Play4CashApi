import { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { I18nService } from '../i18n/i18n.service';
export declare class GlobalExceptionFilter implements ExceptionFilter {
    private readonly i18n;
    constructor(i18n: I18nService);
    catch(exception: unknown, host: ArgumentsHost): void;
}
