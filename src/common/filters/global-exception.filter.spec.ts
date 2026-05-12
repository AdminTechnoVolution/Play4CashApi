import { HttpException, HttpStatus, ArgumentsHost } from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter';
import { BusinessException } from '../exceptions/business.exception';

interface MockResponse {
  status: jest.Mock<MockResponse, [number]>;
  json: jest.Mock<void, [unknown]>;
  _statusCode: number;
  _body: unknown;
}

function makeI18n() {
  return { translate: jest.fn((key: string, _lang: string) => `TR:${key}`) };
}

function makeResponse(): MockResponse {
  const res = {
    _statusCode: 0,
    _body: null,
  } as MockResponse;
  res.status = jest.fn((c: number) => {
    res._statusCode = c;
    return res;
  });
  res.json = jest.fn((b: unknown) => {
    res._body = b;
  });
  return res;
}

function makeHost(req: Record<string, unknown>, res: MockResponse): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getResponse: <T>() => res as unknown as T,
      getRequest: <T>() => req as unknown as T,
    }),
  } as unknown as ArgumentsHost;
}

describe('GlobalExceptionFilter', () => {
  const req = { headers: { 'accept-language': 'es' }, method: 'GET', url: '/x' };
  const consoleErr = jest.spyOn(console, 'error').mockImplementation(() => undefined);

  afterAll(() => consoleErr.mockRestore());

  it('handles BusinessException with its statusCode and translated message', () => {
    const i18n = makeI18n();
    const filter = new GlobalExceptionFilter(i18n as never);
    const res = makeResponse();
    const ex = new BusinessException('ERROR_BIZ', HttpStatus.BAD_REQUEST);

    filter.catch(ex, makeHost(req, res));

    expect(i18n.translate).toHaveBeenCalledWith('ERROR_BIZ', 'es');
    expect(res._statusCode).toBe(HttpStatus.BAD_REQUEST);
    expect(res._body).toEqual({ success: false, messages: ['TR:ERROR_BIZ'], data: null });
  });

  it('handles HttpException with single message', () => {
    const i18n = makeI18n();
    const filter = new GlobalExceptionFilter(i18n as never);
    const res = makeResponse();

    filter.catch(new HttpException('ERROR_FOO', HttpStatus.UNAUTHORIZED), makeHost(req, res));

    expect(res._statusCode).toBe(HttpStatus.UNAUTHORIZED);
    expect(res._body).toEqual({ success: false, messages: ['TR:ERROR_FOO'], data: null });
  });

  it('handles HttpException with array message (e.g. ValidationPipe output)', () => {
    const i18n = makeI18n();
    const filter = new GlobalExceptionFilter(i18n as never);
    const res = makeResponse();
    const ex = new HttpException(
      { message: ['ERROR_A', 'ERROR_B'] },
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(ex, makeHost(req, res));

    expect(res._body).toEqual({
      success: false,
      messages: ['TR:ERROR_A', 'TR:ERROR_B'],
      data: null,
    });
  });

  it('redacts unknown errors and logs the original to console', () => {
    const i18n = makeI18n();
    const filter = new GlobalExceptionFilter(i18n as never);
    const res = makeResponse();

    filter.catch(new Error('SECRET_DB_PASSWORD_LEAKED'), makeHost(req, res));

    expect(res._statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(res._body).toEqual({
      success: false,
      messages: ['TR:ERROR_GENERIC_RESPONSE'],
      data: null,
    });
    // Sanity: the raw message must not have been forwarded to the client.
    expect(JSON.stringify(res._body)).not.toContain('SECRET_DB_PASSWORD_LEAKED');
    expect(consoleErr).toHaveBeenCalled();
  });

  it('falls back to "en" when accept-language is absent', () => {
    const i18n = makeI18n();
    const filter = new GlobalExceptionFilter(i18n as never);
    const res = makeResponse();

    filter.catch(
      new HttpException('ERROR_X', HttpStatus.BAD_REQUEST),
      makeHost({ headers: {}, method: 'GET', url: '/' }, res),
    );

    expect(i18n.translate).toHaveBeenCalledWith('ERROR_X', 'en');
  });
});
