import * as jwt from 'jsonwebtoken';
import { AuthService } from './auth.service';
import { BusinessException } from '../../common/exceptions/business.exception';
import {
  REDIS_KEY_REFRESH_TOKEN,
  REDIS_KEY_SESSION_FAMILY,
  REDIS_KEY_FAMILY_REFRESHES,
  REDIS_KEY_FAMILY_ACCESSES,
} from '../../common/constants/redis-keys.constants';

/**
 * In-memory Redis mock supporting just what AuthService needs:
 * setEx/get/del/exists for strings + sAdd/sMembers/sRem/expire for sets.
 */
function createRedisMock() {
  const strings = new Map<string, string>();
  const sets = new Map<string, Set<string>>();
  const removeKey = (key: string) => {
    const stringDeleted = strings.delete(key);
    const setDeleted = sets.delete(key);
    return stringDeleted || setDeleted ? 1 : 0;
  };
  return {
    strings,
    sets,
    setEx: jest.fn(async (key: string, _ttl: number, value: string) => {
      strings.set(key, value);
      return 'OK';
    }),
    get: jest.fn(async (key: string) => strings.get(key) ?? null),
    del: jest.fn(async (key: string) => removeKey(key)),
    exists: jest.fn(async (key: string) => (strings.has(key) || sets.has(key) ? 1 : 0)),
    sAdd: jest.fn(async (key: string, value: string) => {
      if (!sets.has(key)) sets.set(key, new Set());
      sets.get(key)!.add(value);
      return 1;
    }),
    sRem: jest.fn(async (key: string, value: string) => {
      sets.get(key)?.delete(value);
      return 1;
    }),
    sMembers: jest.fn(async (key: string) => Array.from(sets.get(key) ?? [])),
    expire: jest.fn(async (_key: string, _ttl: number) => 1),
    multi: jest.fn(() => {
      const chain = {
        del: jest.fn((key: string) => {
          removeKey(key);
          return chain;
        }),
        setEx: jest.fn((key: string, _ttl: number, value: string) => {
          strings.set(key, value);
          return chain;
        }),
        sAdd: jest.fn((key: string, value: string) => {
          if (!sets.has(key)) sets.set(key, new Set());
          sets.get(key)!.add(value);
          return chain;
        }),
        sRem: jest.fn((key: string, value: string) => {
          sets.get(key)?.delete(value);
          return chain;
        }),
        expire: jest.fn((_key: string, _ttl: number) => chain),
        exec: jest.fn(async () => []),
      };
      return chain;
    }),
  };
}

const CFG = {
  'jwt.secret': 'test-secret',
  'jwt.issuer': 'p4c',
  'jwt.audience': 'p4c-clients',
  'jwt.accessTtlSecs': 60,
  'jwt.refreshTtlSecs': 600,
  'google.clientId': 'gcid',
  'admin.emails': [] as string[],
};

function configMock() {
  return { get: <T>(k: keyof typeof CFG) => CFG[k] as unknown as T } as any;
}

function makeService(redis: ReturnType<typeof createRedisMock>) {
  const userRepo = {
    findById: jest.fn(async () => ({ role: 'user', email: 'a@b.com' })),
  } as any;
  return new AuthService(configMock(), userRepo, redis as any);
}

function loginPayload(overrides: Partial<{
  id: string;
  email: string;
  username: string;
  name: string;
  role: 'user' | 'admin';
  familyId: string;
  typ: 'refresh' | 'access';
  jti: string;
}> = {}) {
  return {
    id: '507f1f77bcf86cd799439011',
    email: 'a@b.com',
    username: 'alice',
    name: 'Alice',
    role: 'user' as const,
    familyId: 'fam-1',
    typ: 'refresh' as const,
    jti: 'jti-1',
    ...overrides,
  };
}

function sign(payload: Record<string, unknown>) {
  return jwt.sign(payload, CFG['jwt.secret'], {
    issuer: CFG['jwt.issuer'],
    audience: CFG['jwt.audience'],
    expiresIn: 600,
    subject: String(payload.id),
  });
}

async function seedFamily(
  redis: ReturnType<typeof createRedisMock>,
  familyId: string,
  refreshToken: string,
  currentJti: string,
  userId = '507f1f77bcf86cd799439011',
) {
  redis.strings.set(
    `${REDIS_KEY_SESSION_FAMILY}${familyId}`,
    JSON.stringify({ userId, currentJti }),
  );
  redis.strings.set(`${REDIS_KEY_REFRESH_TOKEN}${refreshToken}`, '1');
  redis.sets.set(`${REDIS_KEY_FAMILY_REFRESHES}${familyId}`, new Set([refreshToken]));
  redis.sets.set(`${REDIS_KEY_FAMILY_ACCESSES}${familyId}`, new Set());
}

describe('AuthService.refreshToken', () => {
  it('rotates when refresh is valid and family.currentJti matches', async () => {
    const redis = createRedisMock();
    const svc = makeService(redis);
    const refresh = sign(loginPayload({ jti: 'jti-1' }));
    await seedFamily(redis, 'fam-1', refresh, 'jti-1');

    const out = await svc.refreshToken(refresh);
    expect(out.data.token).toBeDefined();
    expect(out.data.refreshToken).toBeDefined();
    expect(out.data.refreshToken).not.toBe(refresh);

    expect(redis.strings.has(`${REDIS_KEY_REFRESH_TOKEN}${refresh}`)).toBe(false);
    const family = JSON.parse(redis.strings.get(`${REDIS_KEY_SESSION_FAMILY}fam-1`)!);
    expect(family.currentJti).not.toBe('jti-1');
  });

  it('rejects and revokes family when an older (rotated) refresh is replayed', async () => {
    const redis = createRedisMock();
    const svc = makeService(redis);
    const old = sign(loginPayload({ jti: 'jti-old' }));
    await seedFamily(redis, 'fam-1', old, 'jti-new');

    await expect(svc.refreshToken(old)).rejects.toBeInstanceOf(BusinessException);
    expect(redis.strings.has(`${REDIS_KEY_SESSION_FAMILY}fam-1`)).toBe(false);
    expect(redis.sets.has(`${REDIS_KEY_FAMILY_REFRESHES}fam-1`)).toBe(false);
  });

  it('rejects when the family was already revoked (logout)', async () => {
    const redis = createRedisMock();
    const svc = makeService(redis);
    const refresh = sign(loginPayload());
    await expect(svc.refreshToken(refresh)).rejects.toBeInstanceOf(BusinessException);
  });

  it('rejects when JWT is not a refresh type', async () => {
    const redis = createRedisMock();
    const svc = makeService(redis);
    const access = sign({ ...loginPayload(), typ: 'access' });
    await expect(svc.refreshToken(access)).rejects.toBeInstanceOf(BusinessException);
  });

  it('rejects when JWT signature/issuer/audience is wrong', async () => {
    const redis = createRedisMock();
    const svc = makeService(redis);
    const bad = jwt.sign(loginPayload(), 'wrong-secret', {
      issuer: 'someone-else',
      audience: 'someone-else',
      expiresIn: 600,
    });
    await expect(svc.refreshToken(bad)).rejects.toBeInstanceOf(BusinessException);
  });

  it('revokes family when JWT valid + family matches but token missing from allowlist', async () => {
    const redis = createRedisMock();
    const svc = makeService(redis);
    const refresh = sign(loginPayload({ jti: 'jti-1' }));
    redis.strings.set(
      `${REDIS_KEY_SESSION_FAMILY}fam-1`,
      JSON.stringify({ userId: 'u', currentJti: 'jti-1' }),
    );

    await expect(svc.refreshToken(refresh)).rejects.toBeInstanceOf(BusinessException);
    expect(redis.strings.has(`${REDIS_KEY_SESSION_FAMILY}fam-1`)).toBe(false);
  });
});

describe('AuthService.logoutUser', () => {
  it('revokes the whole family when accessToken carries familyId', async () => {
    const redis = createRedisMock();
    const svc = makeService(redis);
    const refresh = sign(loginPayload({ jti: 'jti-1' }));
    const access = sign({ ...loginPayload(), typ: 'access', jti: 'access-jti' });
    await seedFamily(redis, 'fam-1', refresh, 'jti-1');
    redis.sets.get('familyAccesses:fam-1')!.add(access);

    await svc.logoutUser(access, refresh);
    expect(redis.strings.has(`${REDIS_KEY_SESSION_FAMILY}fam-1`)).toBe(false);
    expect(redis.sets.has(`${REDIS_KEY_FAMILY_REFRESHES}fam-1`)).toBe(false);
  });

  it('falls back to single-token revoke when no familyId is decodable', async () => {
    const redis = createRedisMock();
    const svc = makeService(redis);
    redis.strings.set('accessTokens:opaque', '1');
    await svc.logoutUser('opaque', undefined);
    expect(redis.del).toHaveBeenCalledWith('accessTokens:opaque');
  });
});
