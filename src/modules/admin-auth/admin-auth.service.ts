import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import * as jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { REDIS_CLIENT } from '../../common/redis/redis.module';
import { BusinessException } from '../../common/exceptions/business.exception';
import { AdminRepository } from './admin.repository';
import { AdminStatus } from './schemas/admin.schema';
import {
  ADMIN_REDIS_ACCESS,
  ADMIN_REDIS_ADMIN_FAMILIES,
  ADMIN_REDIS_FAMILY,
  ADMIN_REDIS_FAMILY_ACCESSES,
  ADMIN_REDIS_FAMILY_REFRESHES,
  ADMIN_REDIS_REFRESH,
} from './admin-auth.constants';

interface AdminSessionFamily {
  adminId: string;
  currentJti: string;
}

export interface AdminAccessPayload {
  id: string;
  email: string;
  display_name: string;
  role: 'admin';
  actor_type: 'admin';
  familyId: string;
}

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);
  private readonly googleClient: OAuth2Client;

  constructor(
    private readonly config: ConfigService,
    private readonly admins: AdminRepository,
    @Inject(REDIS_CLIENT) private readonly redis: any,
  ) {
    this.googleClient = new OAuth2Client(config.get<string>('adminAuth.googleClientId'));
  }

  async login(googleToken: string) {
    const clientId = this.config.get<string>('adminAuth.googleClientId');
    if (!clientId) throw new BusinessException('ERROR_AUTH', 401);

    let payload;
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: googleToken,
        audience: clientId,
      });
      payload = ticket.getPayload();
    } catch {
      throw new BusinessException('ERROR_AUTH', 401);
    }

    const email = payload?.email?.trim().toLowerCase();
    const subject = payload?.sub;
    if (!email || !subject || payload?.email_verified !== true) {
      throw new BusinessException('ERROR_AUTH', 401);
    }

    const existing = await this.admins.findByEmail(email);
    if (!existing || existing.status !== AdminStatus.ACTIVE) {
      throw new BusinessException('ERROR_AUTH', 401);
    }
    if (existing.google_subject && existing.google_subject !== subject) {
      throw new BusinessException('ERROR_AUTH', 401);
    }

    let admin;
    try {
      admin = await this.admins.bindGoogleSubjectAndRecordLogin(
        String(existing._id),
        subject,
        payload.name?.trim() || existing.display_name,
      );
    } catch {
      // A concurrent first login or an already-bound Google subject must never
      // leak a Mongo duplicate-key error through the authentication endpoint.
      throw new BusinessException('ERROR_AUTH', 401);
    }
    if (!admin) throw new BusinessException('ERROR_AUTH', 401);

    return this.createSession({
      id: String(admin._id),
      email: admin.email,
      display_name: admin.display_name,
    });
  }

  async refresh(currentRefreshToken: string) {
    const payload = this.verify(currentRefreshToken);
    if (
      payload.typ !== 'refresh'
      || payload.actor_type !== 'admin'
      || !payload.familyId
      || !payload.jti
    ) {
      throw new BusinessException('ERROR_AUTH', 401);
    }

    const familyId = String(payload.familyId);
    const familyKey = `${ADMIN_REDIS_FAMILY}${familyId}`;
    const raw = await this.redis.get(familyKey);
    if (!raw) throw new BusinessException('ERROR_AUTH', 401);

    let family: AdminSessionFamily;
    try {
      family = JSON.parse(raw) as AdminSessionFamily;
    } catch {
      await this.revokeFamily(familyId);
      throw new BusinessException('ERROR_AUTH', 401);
    }

    if (
      family.currentJti !== String(payload.jti)
      || await this.redis.exists(`${ADMIN_REDIS_REFRESH}${currentRefreshToken}`) !== 1
    ) {
      this.logger.warn(`event=admin_refresh_reuse family=${familyId}`);
      await this.revokeFamily(familyId);
      throw new BusinessException('ERROR_AUTH', 401);
    }

    const admin = await this.admins.findById(family.adminId);
    if (!admin || admin.status !== AdminStatus.ACTIVE) {
      await this.revokeFamily(familyId);
      throw new BusinessException('ERROR_AUTH', 401);
    }

    await this.redis
      .multi()
      .del(`${ADMIN_REDIS_REFRESH}${currentRefreshToken}`)
      .sRem(`${ADMIN_REDIS_FAMILY_REFRESHES}${familyId}`, currentRefreshToken)
      .exec();

    const base: AdminAccessPayload = {
      id: String(admin._id),
      email: admin.email,
      display_name: admin.display_name,
      role: 'admin',
      actor_type: 'admin',
      familyId,
    };
    const access = this.sign(base, 'access');
    const refresh = this.sign(base, 'refresh');
    family.currentJti = refresh.jti;
    await this.persistRotation(familyId, family, access.token, refresh.token);
    return { token: access.token, refreshToken: refresh.token };
  }

  async logout(accessToken?: string, refreshToken?: string): Promise<void> {
    const token = accessToken || refreshToken;
    if (!token) return;
    try {
      const payload = jwt.decode(token) as { familyId?: string } | null;
      if (payload?.familyId) await this.revokeFamily(payload.familyId);
    } catch {
      // Logout is intentionally idempotent.
    }
  }

  async profile(adminId: string) {
    const admin = await this.admins.findById(adminId);
    if (!admin || admin.status !== AdminStatus.ACTIVE) {
      throw new BusinessException('ERROR_AUTH', 401);
    }
    return {
      id: String(admin._id),
      email: admin.email,
      display_name: admin.display_name,
      status: admin.status,
      last_login_at: admin.last_login_at,
    };
  }

  async revokeAdminSessions(adminId: string): Promise<void> {
    const setKey = `${ADMIN_REDIS_ADMIN_FAMILIES}${adminId}`;
    const familyIds: string[] = await this.redis.sMembers(setKey);
    await Promise.all(familyIds.map((familyId) => this.revokeFamily(familyId)));
    await this.redis.del(setKey);
  }

  private async createSession(admin: { id: string; email: string; display_name: string }) {
    const familyId = randomUUID();
    const base: AdminAccessPayload = {
      ...admin,
      role: 'admin',
      actor_type: 'admin',
      familyId,
    };
    const access = this.sign(base, 'access');
    const refresh = this.sign(base, 'refresh');
    const family: AdminSessionFamily = { adminId: admin.id, currentJti: refresh.jti };
    const refreshTtl = this.config.get<number>('adminAuth.refreshTtlSecs')!;
    const accessTtl = this.config.get<number>('adminAuth.accessTtlSecs')!;

    await this.redis
      .multi()
      .setEx(`${ADMIN_REDIS_FAMILY}${familyId}`, refreshTtl, JSON.stringify(family))
      .setEx(`${ADMIN_REDIS_REFRESH}${refresh.token}`, refreshTtl, '1')
      .setEx(`${ADMIN_REDIS_ACCESS}${access.token}`, accessTtl, '1')
      .sAdd(`${ADMIN_REDIS_FAMILY_REFRESHES}${familyId}`, refresh.token)
      .expire(`${ADMIN_REDIS_FAMILY_REFRESHES}${familyId}`, refreshTtl)
      .sAdd(`${ADMIN_REDIS_FAMILY_ACCESSES}${familyId}`, access.token)
      .expire(`${ADMIN_REDIS_FAMILY_ACCESSES}${familyId}`, refreshTtl)
      .sAdd(`${ADMIN_REDIS_ADMIN_FAMILIES}${admin.id}`, familyId)
      .exec();

    return { token: access.token, refreshToken: refresh.token };
  }

  private async persistRotation(
    familyId: string,
    family: AdminSessionFamily,
    accessToken: string,
    refreshToken: string,
  ): Promise<void> {
    const refreshTtl = this.config.get<number>('adminAuth.refreshTtlSecs')!;
    const accessTtl = this.config.get<number>('adminAuth.accessTtlSecs')!;
    await this.redis
      .multi()
      .setEx(`${ADMIN_REDIS_FAMILY}${familyId}`, refreshTtl, JSON.stringify(family))
      .setEx(`${ADMIN_REDIS_REFRESH}${refreshToken}`, refreshTtl, '1')
      .setEx(`${ADMIN_REDIS_ACCESS}${accessToken}`, accessTtl, '1')
      .sAdd(`${ADMIN_REDIS_FAMILY_REFRESHES}${familyId}`, refreshToken)
      .expire(`${ADMIN_REDIS_FAMILY_REFRESHES}${familyId}`, refreshTtl)
      .sAdd(`${ADMIN_REDIS_FAMILY_ACCESSES}${familyId}`, accessToken)
      .expire(`${ADMIN_REDIS_FAMILY_ACCESSES}${familyId}`, refreshTtl)
      .exec();
  }

  private sign(
    payload: AdminAccessPayload,
    typ: 'access' | 'refresh',
  ): { token: string; jti: string } {
    const secret = this.config.get<string>('adminAuth.jwtSecret');
    if (!secret) throw new Error('ADMIN_JWT_SECRET_KEY is required');
    const jti = randomUUID();
    const ttl = this.config.get<number>(
      typ === 'access' ? 'adminAuth.accessTtlSecs' : 'adminAuth.refreshTtlSecs',
    )!;
    return {
      jti,
      token: jwt.sign(
        { ...payload, typ, jti },
        secret,
        {
          expiresIn: ttl,
          issuer: this.config.get<string>('adminAuth.issuer'),
          audience: this.config.get<string>('adminAuth.audience'),
          subject: payload.id,
        },
      ),
    };
  }

  private verify(token: string): jwt.JwtPayload & Record<string, unknown> {
    try {
      return jwt.verify(
        token,
        this.config.get<string>('adminAuth.jwtSecret')!,
        {
          issuer: this.config.get<string>('adminAuth.issuer'),
          audience: this.config.get<string>('adminAuth.audience'),
        },
      ) as jwt.JwtPayload & Record<string, unknown>;
    } catch {
      throw new BusinessException('ERROR_AUTH', 401);
    }
  }

  private async revokeFamily(familyId: string): Promise<void> {
    const raw = await this.redis.get(`${ADMIN_REDIS_FAMILY}${familyId}`);
    let adminId: string | undefined;
    try {
      adminId = raw ? (JSON.parse(raw) as AdminSessionFamily).adminId : undefined;
    } catch {
      // Continue clearing token sets even if family metadata is malformed.
    }
    const [refreshes, accesses]: [string[], string[]] = await Promise.all([
      this.redis.sMembers(`${ADMIN_REDIS_FAMILY_REFRESHES}${familyId}`),
      this.redis.sMembers(`${ADMIN_REDIS_FAMILY_ACCESSES}${familyId}`),
    ]);
    const keys = [
      `${ADMIN_REDIS_FAMILY}${familyId}`,
      `${ADMIN_REDIS_FAMILY_REFRESHES}${familyId}`,
      `${ADMIN_REDIS_FAMILY_ACCESSES}${familyId}`,
      ...refreshes.map((token) => `${ADMIN_REDIS_REFRESH}${token}`),
      ...accesses.map((token) => `${ADMIN_REDIS_ACCESS}${token}`),
    ];
    await this.redis.del(keys);
    if (adminId) {
      await this.redis.sRem(`${ADMIN_REDIS_ADMIN_FAMILIES}${adminId}`, familyId);
    }
  }
}
