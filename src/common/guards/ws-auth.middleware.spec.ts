import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { Server, Socket } from 'socket.io';
import { applyWsAuth } from './ws-auth.middleware';

const SECRET = 'unit-test-secret';
const ISSUER = 'play4cash-api';
const AUDIENCE = 'play4cash-clients';

function makeConfig(): ConfigService {
  const values: Record<string, unknown> = {
    'jwt.secret': SECRET,
    'jwt.issuer': ISSUER,
    'jwt.audience': AUDIENCE,
    'auth.accessCookieName': 'p4c_access',
  };
  return { get: <T>(k: string) => values[k] as T } as ConfigService;
}

function captureServerMiddleware(): {
  server: Server;
  getMiddleware: () => (socket: Socket, next: (err?: Error) => void) => Promise<void>;
} {
  let captured: ((socket: Socket, next: (err?: Error) => void) => Promise<void>) | undefined;
  const server = {
    use: (fn: (socket: Socket, next: (err?: Error) => void) => Promise<void>) => {
      captured = fn;
    },
  } as unknown as Server;
  return {
    server,
    getMiddleware: () => {
      if (!captured) throw new Error('No middleware captured');
      return captured;
    },
  };
}

function makeSocket(handshake: Partial<Socket['handshake']>): Socket {
  return {
    handshake: { auth: {}, query: {}, headers: {}, ...handshake },
    data: {} as Record<string, unknown>,
  } as unknown as Socket;
}

function signAccess(payload: Record<string, unknown> = {}): string {
  return jwt.sign(
    { id: 'u1', email: 'u@x', typ: 'access', jti: 'j1', ...payload },
    SECRET,
    { issuer: ISSUER, audience: AUDIENCE, expiresIn: '5m' },
  );
}

describe('applyWsAuth', () => {
  it('rejects when no token is provided', async () => {
    const { server, getMiddleware } = captureServerMiddleware();
    applyWsAuth(server, makeConfig(), { exists: jest.fn() });

    const socket = makeSocket({ auth: {}, query: {}, headers: {} });
    const next = jest.fn();
    await getMiddleware()(socket, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'ERROR_AUTH' }));
  });

  it('accepts a valid access token from the cookie header', async () => {
    const { server, getMiddleware } = captureServerMiddleware();
    const exists = jest.fn().mockResolvedValue(1);
    applyWsAuth(server, makeConfig(), { exists });

    const token = signAccess({ id: 'u-cookie' });
    const socket = makeSocket({ headers: { cookie: `p4c_access=${token}` } });
    const next = jest.fn();
    await getMiddleware()(socket, next);

    expect(next).toHaveBeenCalledWith();
    expect(socket.data.player_id).toBe('u-cookie');
  });

  it('rejects refresh-typed tokens', async () => {
    const refresh = jwt.sign(
      { id: 'u1', email: 'u@x', typ: 'refresh' },
      SECRET,
      { issuer: ISSUER, audience: AUDIENCE, expiresIn: '5m' },
    );
    const { server, getMiddleware } = captureServerMiddleware();
    applyWsAuth(server, makeConfig(), { exists: jest.fn().mockResolvedValue(1) });

    const socket = makeSocket({ auth: { token: refresh } });
    const next = jest.fn();
    await getMiddleware()(socket, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'ERROR_AUTH' }));
  });

  it('rejects when token is missing from Redis allowlist', async () => {
    const { server, getMiddleware } = captureServerMiddleware();
    applyWsAuth(server, makeConfig(), { exists: jest.fn().mockResolvedValue(0) });

    const socket = makeSocket({ auth: { token: signAccess() } });
    const next = jest.fn();
    await getMiddleware()(socket, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'ERROR_AUTH' }));
  });

  it('rejects when Redis exists() throws', async () => {
    const { server, getMiddleware } = captureServerMiddleware();
    applyWsAuth(server, makeConfig(), { exists: jest.fn().mockRejectedValue(new Error('redis down')) });

    const socket = makeSocket({ auth: { token: signAccess() } });
    const next = jest.fn();
    await getMiddleware()(socket, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'ERROR_AUTH' }));
  });

  it('strips "Bearer " prefix from authorization header', async () => {
    const { server, getMiddleware } = captureServerMiddleware();
    const exists = jest.fn().mockResolvedValue(1);
    applyWsAuth(server, makeConfig(), { exists });

    const token = signAccess();
    const socket = makeSocket({ headers: { authorization: `Bearer ${token}` } });
    const next = jest.fn();
    await getMiddleware()(socket, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toBeUndefined();
    expect(exists).toHaveBeenCalledWith(expect.stringContaining(token));
  });

  it('passes a valid token and populates socket.data', async () => {
    const { server, getMiddleware } = captureServerMiddleware();
    applyWsAuth(server, makeConfig(), { exists: jest.fn().mockResolvedValue(1) });

    const token = signAccess({ id: 'u-xyz' });
    const socket = makeSocket({ query: { token } });
    const next = jest.fn();
    await getMiddleware()(socket, next);

    expect(next).toHaveBeenCalledWith();
    expect(socket.data.player_id).toBe('u-xyz');
    expect(socket.data.token).toBe(token);
  });
});
