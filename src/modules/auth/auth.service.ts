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

    let { email, name } = googlePayload;
    email = email.toLowerCase();

    let user = await this.userRepo.findByEmail(email);

    if (!user) {
      const base = (name || 'user').replace(/\s+/g, '_').toLowerCase().slice(0, 20) || 'user';
      let username = base;
      for (let i = 0; i < 25; i++) {
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
    }

    if (user.status !== 'active') {
      throw new BusinessException('ERROR_LOGIN', 401);
    }

    const role = this.resolveRole(user.role, email);
    const familyId = randomUUID();
    const userId = String(user._id);

    const accessPayload: AccessPayload = { id: userId, email: user.email, username: user.username, name, role, familyId };
    const { token: accessToken, jti: accessJti } = await this.issueAccessToken(accessPayload);
    const { token: refreshToken, jti: refreshJti } = await this.issueRefreshToken(accessPayload);

    await this.persistFamily(familyId, userId, refreshJti, refreshToken, accessToken);
    this.logger.log(`[AuthService] Login OK userId=${userId} family=${familyId}`);

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
    await this.redis.del(`${REDIS_KEY_REFRESH_TOKEN}${currentRefreshToken}`);
    await this.redis.sRem(`${REDIS_KEY_FAMILY_REFRESHES}${familyId}`, currentRefreshToken);

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
    const refreshTtl = this.config.get<number>('jwt.refreshTtlSecs')!;
    await this.redis.setEx(familyKey, refreshTtl, JSON.stringify(family));
    await this.redis.sAdd(`${REDIS_KEY_FAMILY_REFRESHES}${familyId}`, newRefresh);
    await this.redis.expire(`${REDIS_KEY_FAMILY_REFRESHES}${familyId}`, refreshTtl);
    await this.redis.sAdd(`${REDIS_KEY_FAMILY_ACCESSES}${familyId}`, newAccess);
    await this.redis.expire(`${REDIS_KEY_FAMILY_ACCESSES}${familyId}`, refreshTtl);

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
    return this.signToken({ ...base, typ: 'access' }, ttl, REDIS_KEY_ACCESS_TOKEN);
  }

  private async issueRefreshToken(base: AccessPayload): Promise<{ token: string; jti: string }> {
    const ttl = this.config.get<number>('jwt.refreshTtlSecs')!;
    return this.signToken({ ...base, typ: 'refresh' }, ttl, REDIS_KEY_REFRESH_TOKEN);
  }

  private async signToken(
    payload: Record<string, unknown>,
    ttlSecs: number,
    redisPrefix: string,
  ): Promise<{ token: string; jti: string }> {
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
    await this.redis.setEx(`${redisPrefix}${token}`, ttlSecs, JSON.stringify(fullPayload));
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
    await this.redis.setEx(`${REDIS_KEY_SESSION_FAMILY}${familyId}`, refreshTtl, JSON.stringify(family));
    await this.redis.sAdd(`${REDIS_KEY_FAMILY_REFRESHES}${familyId}`, refreshToken);
    await this.redis.expire(`${REDIS_KEY_FAMILY_REFRESHES}${familyId}`, refreshTtl);
    await this.redis.sAdd(`${REDIS_KEY_FAMILY_ACCESSES}${familyId}`, accessToken);
    await this.redis.expire(`${REDIS_KEY_FAMILY_ACCESSES}${familyId}`, refreshTtl);
  }

  private async revokeFamily(familyId: string): Promise<void> {
    try {
      const refreshSet = `${REDIS_KEY_FAMILY_REFRESHES}${familyId}`;
      const accessSet = `${REDIS_KEY_FAMILY_ACCESSES}${familyId}`;
      const [refreshes, accesses]: [string[], string[]] = await Promise.all([
        this.redis.sMembers(refreshSet),
        this.redis.sMembers(accessSet),
      ]);
      const ops: Promise<unknown>[] = [];
      for (const t of refreshes || []) ops.push(this.redis.del(`${REDIS_KEY_REFRESH_TOKEN}${t}`));
      for (const t of accesses || []) ops.push(this.redis.del(`${REDIS_KEY_ACCESS_TOKEN}${t}`));
      ops.push(this.redis.del(refreshSet));
      ops.push(this.redis.del(accessSet));
      ops.push(this.redis.del(`${REDIS_KEY_SESSION_FAMILY}${familyId}`));
      await Promise.all(ops);
    } catch (err) {
      this.logger.error(`Error revoking family ${familyId}: ${err}`);
    }
  }
}
