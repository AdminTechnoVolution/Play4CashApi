import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Domain-level exception that maps to a specific HTTP status code.
 * The message is a string key (e.g. 'ERROR_AUTH', 'ERROR_GENERIC_RESPONSE')
 * that can be resolved by the i18n layer on the client.
 *
 * `data` is an optional structured payload surfaced verbatim to the client
 * (e.g. `{ activeRoomId: '...' }` for ERROR_USER_ALREADY_IN_ROOM so the PWA can
 * deep-link to the existing room without making another round-trip).
 */
export class BusinessException extends HttpException {
  public readonly statusCode: number;
  public readonly data: Record<string, unknown> | null;

  constructor(
    messageKey: string,
    statusCode: number = HttpStatus.BAD_REQUEST,
    data: Record<string, unknown> | null = null,
  ) {
    super(messageKey, statusCode);
    this.statusCode = statusCode;
    this.data = data;
  }
}
