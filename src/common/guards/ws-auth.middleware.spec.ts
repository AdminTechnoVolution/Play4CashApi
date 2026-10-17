import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { Server, Socket } from 'socket.io';
import { applyWsAuth } from './ws-auth.middleware';
import { acknowledgeInitialState } from '../ws/match-start';

jest.mock('../ws/match-start', () => ({ acknowledgeInitialState: jest.fn() }));
jest.mock('../reliable-commands/reliable-commands', () => ({
  ...jest.requireActual('../reliable-commands/reliable-commands'),
  reliableConnection: jest.fn(() => ({ collection: () => ({ findOne: jest.fn().mockResolvedValue(null) }) })),
}));

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
  roomEmit: jest.Mock;
  getMiddleware: () => (socket: Socket, next: (err?: Error) => void) => Promise<void>;
} {
  let captured: ((socket: Socket, next: (err?: Error) => void) => Promise<void>) | undefined;
  const roomEmit = jest.fn();
  const server = {
    name: '/uno',
    to: jest.fn(() => ({ emit: roomEmit })),
    use: (fn: (socket: Socket, next: (err?: Error) => void) => Promise<void>) => {
      captured = fn;
    },
  } as unknown as Server;
  return {
    server,
    roomEmit,
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
    join: jest.fn().mockResolvedValue(undefined),
    use: jest.fn(),
    on: jest.fn(),
    emit: jest.fn(),
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

  it('rejects tokens in URL query parameters', async () => {
    const { server, getMiddleware } = captureServerMiddleware();
    applyWsAuth(server, makeConfig(), { exists: jest.fn().mockResolvedValue(1) });
    const next = jest.fn();
    await getMiddleware()(makeSocket({ query: { token: signAccess() } }), next);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'ERROR_AUTH' }));
  });

  it('passes a valid token and populates socket.data', async () => {
    const { server, getMiddleware } = captureServerMiddleware();
    applyWsAuth(server, makeConfig(), { exists: jest.fn().mockResolvedValue(1) });

    const token = signAccess({ id: 'u-xyz' });
    const socket = makeSocket({ auth: { token } });
    const next = jest.fn();
    await getMiddleware()(socket, next);

    expect(next).toHaveBeenCalledWith();
    expect(socket.data.player_id).toBe('u-xyz');
    expect(socket.data.token).toBe(token);
    expect(socket.on).toHaveBeenCalledWith('initial_state_ack', expect.any(Function));
  });

  it('asks players who have not acknowledged the start snapshot to fetch it again', async () => {
    const { server, roomEmit, getMiddleware } = captureServerMiddleware();
    applyWsAuth(server, makeConfig(), { exists: jest.fn().mockResolvedValue(1) });
    const socket = makeSocket({ auth: { token: signAccess({ id: 'u1' }) } });
    await getMiddleware()(socket, jest.fn());
    const onAck = (socket.on as jest.Mock).mock.calls.find(([event]) => event === 'initial_state_ack')[1];
    const state = { roomId: 'r1', phase: 'preparing' };

    (acknowledgeInitialState as jest.Mock).mockResolvedValueOnce({ state, pending: ['u2'] });
    await onAck({ roomId: 'r1' });
    expect(socket.emit).toHaveBeenCalledWith('match_start_state', state);
    expect(server.to).toHaveBeenCalledWith(['player:u2']);
    expect(roomEmit).toHaveBeenCalledWith('match_start_state', state);

    (server.to as jest.Mock).mockClear();
    (acknowledgeInitialState as jest.Mock).mockResolvedValueOnce({ state: { ...state, phase: 'active' }, pending: [] });
    await onAck({ roomId: 'r1' });
    expect(server.to).not.toHaveBeenCalled();
  });

  it('rejects the status of a command whose room no longer includes the player', async () => {
    process.env.RELIABLE_COMMANDS_ENABLED = 'true';
    try {
      const { server, getMiddleware } = captureServerMiddleware();
      applyWsAuth(server, makeConfig(), { exists: jest.fn().mockResolvedValue(1) });
      const socket = makeSocket({ auth: { token: signAccess({ id: '507f1f77bcf86cd799439011' }) } });
      await getMiddleware()(socket, jest.fn());
      const onStatus = (socket.on as jest.Mock).mock.calls.find(([event]) => event === 'command_status')[1];
      await onStatus({ roomId: '507f1f77bcf86cd799439012', commandId: 'cmd-0123456789abcdef' });
      expect(socket.emit).toHaveBeenCalledWith('command_ack', { commandId: 'cmd-0123456789abcdef',
        roomId: '507f1f77bcf86cd799439012', status: 'rejected', reason: 'COMMAND_PLAYER_NOT_IN_ROOM', version: 0 });
    } finally { delete process.env.RELIABLE_COMMANDS_ENABLED; }
  });
});
