import { BusinessException } from '../../common/exceptions/business.exception';
import { AdminAuthService } from './admin-auth.service';
import { AdminStatus } from './schemas/admin.schema';
import * as jwt from 'jsonwebtoken';

const configValues = {
  'adminAuth.googleClientId': 'admin-google-client',
  'adminAuth.jwtSecret': 'admin-secret',
  'adminAuth.accessTtlSecs': 60,
  'adminAuth.refreshTtlSecs': 600,
  'adminAuth.issuer': 'p4c',
  'adminAuth.audience': 'play4cash-admin',
};

function configMock() {
  return { get: (key: keyof typeof configValues) => configValues[key] } as any;
}

function redisMock() {
  const chain: any = {};
  for (const method of ['setEx', 'sAdd', 'expire', 'del', 'sRem']) {
    chain[method] = jest.fn(() => chain);
  }
  chain.exec = jest.fn(async () => []);
  return {
    multi: jest.fn(() => chain),
    get: jest.fn(),
    exists: jest.fn(),
    sMembers: jest.fn(async () => []),
    del: jest.fn(async () => 1),
    sRem: jest.fn(async () => 1),
  };
}

function admin(overrides: Record<string, unknown> = {}) {
  return {
    _id: '507f1f77bcf86cd799439011',
    email: 'admin@p4c.com',
    display_name: 'P4C Admin',
    status: AdminStatus.ACTIVE,
    google_subject: undefined,
    ...overrides,
  };
}

function makeService(existing: unknown) {
  const admins = {
    findByEmail: jest.fn(async () => existing),
    bindGoogleSubjectAndRecordLogin: jest.fn(async () => existing),
    findById: jest.fn(async () => existing),
  };
  const redis = redisMock();
  const service = new AdminAuthService(configMock(), admins as any, redis as any);
  (service as any).googleClient = {
    verifyIdToken: jest.fn(async () => ({
      getPayload: () => ({
        email: 'Admin@P4C.com',
        email_verified: true,
        sub: 'google-subject',
        name: 'P4C Admin',
      }),
    })),
  };
  return { service, admins, redis };
}

describe('AdminAuthService.login', () => {
  it('rejects an email absent from admins without creating a record', async () => {
    const { service, admins } = makeService(null);
    await expect(service.login('google-token')).rejects.toBeInstanceOf(BusinessException);
    expect(admins.bindGoogleSubjectAndRecordLogin).not.toHaveBeenCalled();
  });

  it('rejects disabled administrators', async () => {
    const { service } = makeService(admin({ status: AdminStatus.DISABLED }));
    await expect(service.login('google-token')).rejects.toBeInstanceOf(BusinessException);
  });

  it('rejects a different Google subject for an already linked email', async () => {
    const { service } = makeService(admin({ google_subject: 'another-subject' }));
    await expect(service.login('google-token')).rejects.toBeInstanceOf(BusinessException);
  });

  it('binds the Google subject and issues an isolated admin session', async () => {
    const row = admin();
    const { service, admins, redis } = makeService(row);
    const result = await service.login('google-token');

    expect(admins.bindGoogleSubjectAndRecordLogin).toHaveBeenCalledWith(
      row._id,
      'google-subject',
      'P4C Admin',
    );
    expect(result.token).toEqual(expect.any(String));
    expect(result.refreshToken).toEqual(expect.any(String));
    expect(redis.multi).toHaveBeenCalled();
  });

  it('requires a verified Google email', async () => {
    const { service } = makeService(admin());
    (service as any).googleClient.verifyIdToken = jest.fn(async () => ({
      getPayload: () => ({
        email: 'admin@p4c.com',
        email_verified: false,
        sub: 'google-subject',
      }),
    }));
    await expect(service.login('google-token')).rejects.toBeInstanceOf(BusinessException);
  });

  it('sanitizes a concurrent Google subject binding conflict', async () => {
    const { service, admins } = makeService(admin());
    admins.bindGoogleSubjectAndRecordLogin.mockRejectedValueOnce(
      Object.assign(new Error('duplicate key'), { code: 11000 }),
    );

    await expect(service.login('google-token')).rejects.toBeInstanceOf(BusinessException);
  });
});

describe('AdminAuthService.refresh', () => {
  it('revokes the session family when the administrator was disabled', async () => {
    const row = admin();
    const { service, admins, redis } = makeService(row);
    const session = await service.login('google-token');
    const payload = jwt.decode(session.refreshToken) as jwt.JwtPayload;

    redis.get.mockResolvedValue(JSON.stringify({
      adminId: row._id,
      currentJti: payload.jti,
    }));
    redis.exists.mockResolvedValue(1);
    admins.findById.mockResolvedValue(admin({ status: AdminStatus.DISABLED }));

    await expect(service.refresh(session.refreshToken)).rejects.toBeInstanceOf(
      BusinessException,
    );
    expect(redis.del).toHaveBeenCalled();
  });
});
