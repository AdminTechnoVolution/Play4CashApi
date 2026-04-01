import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Domain-level exception that maps to a specific HTTP status code.
 * The message is a string key (e.g. 'ERROR_AUTH', 'ERROR_GENERIC_RESPONSE')
 * that can be resolved by the i18n layer on the client.
 */
export class BusinessException extends HttpException {
  public readonly statusCode: number;

  constructor(messageKey: string, statusCode: number = HttpStatus.BAD_REQUEST) {
    super(messageKey, statusCode);
    this.statusCode = statusCode;
  }
}
