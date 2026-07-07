import { HttpException } from '@nestjs/common';
export declare class BusinessException extends HttpException {
    readonly statusCode: number;
    readonly data: Record<string, unknown> | null;
    constructor(messageKey: string, statusCode?: number, data?: Record<string, unknown> | null);
}
