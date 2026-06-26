import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import * as jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { REDIS_CLIENT } from '../../common/redis/redis.module';
import {
  REDIS_KEY_ACCESS_TOKEN,
  REDIS_KEY_REFRESH_TOKEN,
  REDIS_KEY_SESSION_FAMILY,
  REDIS_KEY_FAMILY_REFRESHES,
  REDIS_KEY_FAMILY_ACCESSES,
} from '../../common/constants/redis-keys.constants';
import { BusinessException } from '../../common/exceptions/business.exception';
import { UserRepository } from '../user/user.repository';
import { UserRole } from '../user/schemas/user.schema';
import { jwtVerifyOptions, isRefreshTokenPayload } from '../../common/auth/jwt-token.util';
import { buildLogLine, elapsedMs } from '../../common/perf-log.util';

interface SessionFamilyValue {
  userId: string;
  currentJti: string;
}

interface AccessPayload {
  id: string;
  email: string;
  username: string;
  name?: string;
  role: 'admin' | 'user';
  familyId: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly googleClient: OAuth2Client;

  constructor(
    private readonly config: ConfigService,
    private readonly userRepo: UserRepository,
    @Inject(REDIS_CLIENT) private readonly redis: any,
  ) {
    this.googleClient = new OAuth2Client(config.get<string>('google.clientId'));
  }

  // ─── Login (Google OAuth) ───────────────────────────────────────────────────
  async loginUser(googleToken: string): Promise<any> {
    const startedAt = process.hrtime.bigint();
    const googleVerifyStart = process.hrtime.bigint();
    let googlePayload: any;
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: googleToken,
        audience: this.config.get<string>('google.clientId')!,
      });
      googlePayload = ticket.getPayload();
    } catch {
      throw new BusinessException('ERROR_LOGIN', 401);
    }
    const googleVerifyMs = Number(process.hrtime.bigint() - googleVerifyStart) / 1_000_000;

    let { email, name } = googlePayload;
    email = email.toLowerCase();

    const userLookupStart = process.hrtime.bigint();
    let user = await this.userRepo.findByEmail(email);
    const userLookupMs = Number(process.hrtime.bigint() - userLookupStart) / 1_000_000;

    const userWasCreated = !user;
    let userCreateMs = 0;
    let usernameCollisionChecks = 0;
    if (userWasCreated) {
      const userCreateStart = process.hrtime.bigint();
      const base = (name || 'user').replace(/\s+/g, '_').toLowerCase().slice(0, 20) || 'user';
      let username = base;
      for (let i = 0; i < 25; i++) {
        usernameCollisionChecks += 1;
        const taken = await this.userRepo.findByUsername(username);
        if (!taken) break;
        const suffix = String(Math.floor(Math.random() * 10000));
        const prefix = base.slice(0, Math.max(1, 20 - suffix.length));
        username = (prefix + suffix).slice(0, 20);
      }
      if (await this.userRepo.findByUsername(username)) {
        username = `u${Date.now()}`.slice(-20);
      }
      user = await this.userRepo.create({ email, username, status: 'active' as any });
      userCreateMs = Number(process.hrtime.bigint() - userCreateStart) / 1_000_000;
    }

    if (!user) {
      throw new BusinessException('ERROR_LOGIN', 401);
    }

    const activeUser = user;

    if (activeUser.status !== 'active') {
      throw new BusinessException('ERROR_LOGIN', 401);
    }

    const role = this.resolveRole(activeUser.role, email);
    const familyId = randomUUID();
    const userId = String(activeUser._id);

    const accessPayload: AccessPayload = {
      id: userId,
      email: activeUser.email,
      username: activeUser.username,
      name,
      role,
      familyId,
    };
    const tokenIssueStart = process.hrtime.bigint();
    const { token: accessToken } = await this.issueAccessToken(accessPayload);
    const { token: refreshToken, jti: refreshJti } = await this.issueRefreshToken(accessPayload);
    const tokenIssueMs = Number(process.hrtime.bigint() - tokenIssueStart) / 1_000_000;

    const persistStart = process.hrtime.bigint();
    await this.persistFamily(familyId, userId, refreshJti, refreshToken, accessToken);
    const persistMs = Number(process.hrtime.bigint() - persistStart) / 1_000_000;
    this.logger.log(`[AuthService] Login OK userId=${userId} family=${familyId}`);
    this.logger.log(
      buildLogLine('login_trace', startedAt, {
        google_verify_ms: googleVerifyMs.toFixed(1),
        user_lookup_ms: userLookupMs.toFixed(1),
        user_create_ms: userCreateMs.toFixed(1),
        token_issue_ms: tokenIssueMs.toFixed(1),
        persist_ms: persistMs.toFixed(1),
        total_ms: elapsedMs(startedAt).toFixed(1),
        username_collision_checks: usernameCollisionChecks,
        user_created: userWasCreated,
      }),
    );

    return { success: true, messages: [], data: { token: accessToken, refreshToken } };
  }

  // ─── Refresh Token (with reuse detection) ──────────────────────────────────
  async refreshToken(currentRefreshToken: string): Promise<any> {
    const secret = this.config.get<string>('jwt.secret')!;
    let payload: jwt.JwtPayload & Record<string, unknown>;
    try {
      payload = jwt.verify(currentRefreshToken, secret, jwtVerifyOptions(this.config)) as jwt.JwtPayload &
        Record<string, unknown>;
    } catch {
      throw new BusinessException('ERROR_AUTH', 401);
    }

    if (!isRefreshTokenPayload(payload) || !payload.familyId || !payload.jti) {
      throw new BusinessException('ERROR_AUTH', 401);
    }

    const familyId = String(payload.familyId);
    const presentedJti = String(payload.jti);
    const familyKey = `${REDIS_KEY_SESSION_FAMILY}${familyId}`;

    const familyRaw: string | null = await this.redis.get(familyKey);
    if (!familyRaw) {
      // Family revoked (logout or reuse already detected): reject without rotating.
      throw new BusinessException('ERROR_AUTH', 401);
    }

    let family: SessionFamilyValue;
    try {
      family = JSON.parse(familyRaw) as SessionFamilyValue;
    } catch {
      await this.revokeFamily(familyId);
      throw new BusinessException('ERROR_AUTH', 401);
    }

    if (family.currentJti !== presentedJti) {
      this.logger.warn(`[AuthService] Refresh reuse detected family=${familyId} → revoking session`);
      await this.revokeFamily(familyId);
      throw new BusinessException('ERROR_AUTH', 401);
    }

    const inAllowlist = await this.redis.exists(`${REDIS_KEY_REFRESH_TOKEN}${currentRefreshToken}`);
    if (inAllowlist !== 1) {
      this.logger.warn(`[AuthService] Refresh jti matches family but token missing in allowlist → revoke family=${familyId}`);
      await this.revokeFamily(familyId);
      throw new BusinessException('ERROR_AUTH', 401);
    }

    // Rotate: remove old refresh from allowlist + family set
    await this.redis
      .multi()
      .del(`${REDIS_KEY_REFRESH_TOKEN}${currentRefreshToken}`)
      .sRem(`${REDIS_KEY_FAMILY_REFRESHES}${familyId}`, currentRefreshToken)
      .exec();

    // Re-resolve role from DB so demotions/promotions take effect on next refresh.
    const userDoc = await this.userRepo.findById(family.userId);
    const role = this.resolveRole(userDoc?.role, (payload.email as string)?.toLowerCase());

    const next: AccessPayload = {
      id: family.userId,
      email: String(payload.email),
      username: String(payload.username),
      name: (payload.name as string) || '',
      role,
      familyId,
    };

    const { token: newAccess } = await this.issueAccessToken(next);
    const { token: newRefresh, jti: newRefreshJti } = await this.issueRefreshToken(next);

    family.currentJti = newRefreshJti;
    await this.rotateFamily(
      familyId,
      familyKey,
      family,
      currentRefreshToken,
      newAccess,
      newRefresh,
    );

    return { success: true, messages: [], data: { token: newAccess, refreshToken: newRefresh } };
  }

  // ─── Logout ─────────────────────────────────────────────────────────────────
  async logoutUser(accessToken: string, refreshToken?: string): Promise<void> {
    try {
      let familyId: string | undefined;
      if (accessToken) {
        try {
          const decoded = jwt.decode(accessToken) as { familyId?: string } | null;
          familyId = decoded?.familyId;
        } catch { /* ignore */ }
      }
      if (!familyId && refreshToken) {
        try {
          const decoded = jwt.decode(refreshToken) as { familyId?: string } | null;
          familyId = decoded?.familyId;
        } catch { /* ignore */ }
      }
      if (familyId) {
        await this.revokeFamily(familyId);
      } else {
        const ops: Promise<unknown>[] = [];
        if (refreshToken) ops.push(this.redis.del(`${REDIS_KEY_REFRESH_TOKEN}${refreshToken}`));
        if (accessToken) ops.push(this.redis.del(`${REDIS_KEY_ACCESS_TOKEN}${accessToken}`));
        if (ops.length) await Promise.all(ops);
      }
    } catch (err) {
      this.logger.error(`Error during logout: ${err}`);
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────
  private resolveRole(dbRole: string | undefined, email: string | undefined): 'admin' | 'user' {
    if (dbRole === UserRole.ADMIN) return 'admin';
    const adminEmails = (this.config.get<string[]>('admin.emails') || []).map((e) => e.toLowerCase());
    if (email && adminEmails.includes(email)) return 'admin';
    return 'user';
  }

  private async issueAccessToken(base: AccessPayload): Promise<{ token: string; jti: string }> {
    const ttl = this.config.get<number>('jwt.accessTtlSecs')!;
    return this.signToken({ ...base, typ: 'access' }, ttl);
  }

  private async issueRefreshToken(base: AccessPayload): Promise<{ token: string; jti: string }> {
    const ttl = this.config.get<number>('jwt.refreshTtlSecs')!;
    return this.signToken({ ...base, typ: 'refresh' }, ttl);
  }

  private async signToken(payload: Record<string, unknown>, ttlSecs: number): Promise<{ token: string; jti: string }> {
    const secret = this.config.get<string>('jwt.secret')!;
    const issuer = this.config.get<string>('jwt.issuer')!;
    const audience = this.config.get<string>('jwt.audience')!;
    const jti = randomUUID();
    const fullPayload = { ...payload, jti };
    const token = jwt.sign(fullPayload, secret, {
      expiresIn: ttlSecs,
      issuer,
      audience,
      subject: String(payload.id),
    });
    return { token, jti };
  }

  private async persistFamily(
    familyId: string,
    userId: string,
    refreshJti: string,
    refreshToken: string,
    accessToken: string,
  ): Promise<void> {
    const refreshTtl = this.config.get<number>('jwt.refreshTtlSecs')!;
    const family: SessionFamilyValue = { userId, currentJti: refreshJti };
    const refreshSet = `${REDIS_KEY_FAMILY_REFRESHES}${familyId}`;
    const accessSet = `${REDIS_KEY_FAMILY_ACCESSES}${familyId}`;
    await this.redis
      .multi()
      .setEx(`${REDIS_KEY_SESSION_FAMILY}${familyId}`, refreshTtl, JSON.stringify(family))
      .setEx(`${REDIS_KEY_REFRESH_TOKEN}${refreshToken}`, refreshTtl, '1')
      .setEx(`${REDIS_KEY_ACCESS_TOKEN}${accessToken}`, this.config.get<number>('jwt.accessTtlSecs')!, '1')
      .sAdd(refreshSet, refreshToken)
      .expire(refreshSet, refreshTtl)
      .sAdd(accessSet, accessToken)
      .expire(accessSet, refreshTtl)
      .exec();
  }

  private async rotateFamily(
    familyId: string,
    familyKey: string,
    family: SessionFamilyValue,
    currentRefreshToken: string,
    newAccess: string,
    newRefresh: string,
  ): Promise<void> {
    const refreshTtl = this.config.get<number>('jwt.refreshTtlSecs')!;
    const refreshSet = `${REDIS_KEY_FAMILY_REFRESHES}${familyId}`;
    const accessSet = `${REDIS_KEY_FAMILY_ACCESSES}${familyId}`;

    await this.redis
      .multi()
      .del(`${REDIS_KEY_REFRESH_TOKEN}${currentRefreshToken}`)
      .sRem(refreshSet, currentRefreshToken)
      .setEx(familyKey, refreshTtl, JSON.stringify(family))
      .setEx(`${REDIS_KEY_REFRESH_TOKEN}${newRefresh}`, refreshTtl, '1')
      .setEx(`${REDIS_KEY_ACCESS_TOKEN}${newAccess}`, this.config.get<number>('jwt.accessTtlSecs')!, '1')
      .sAdd(refreshSet, newRefresh)
      .expire(refreshSet, refreshTtl)
      .sAdd(accessSet, newAccess)
      .expire(accessSet, refreshTtl)
      .exec();
  }

  private async revokeFamily(familyId: string): Promise<void> {
    try {
      const refreshSet = `${REDIS_KEY_FAMILY_REFRESHES}${familyId}`;
      const accessSet = `${REDIS_KEY_FAMILY_ACCESSES}${familyId}`;
      const [refreshes, accesses]: [string[], string[]] = await Promise.all([
        this.redis.sMembers(refreshSet),
        this.redis.sMembers(accessSet),
      ]);
      const multi = this.redis.multi();
      for (const t of refreshes || []) multi.del(`${REDIS_KEY_REFRESH_TOKEN}${t}`);
      for (const t of accesses || []) multi.del(`${REDIS_KEY_ACCESS_TOKEN}${t}`);
      multi.del(refreshSet);
      multi.del(accessSet);
      multi.del(`${REDIS_KEY_SESSION_FAMILY}${familyId}`);
      await multi.exec();
    } catch (err) {
      this.logger.error(`Error revoking family ${familyId}: ${err}`);
    }
  }
}
