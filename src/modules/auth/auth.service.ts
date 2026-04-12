import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import * as jwt from 'jsonwebtoken';
import { REDIS_CLIENT } from '../../common/redis/redis.module';
import { REDIS_KEY_ACCESS_TOKEN, REDIS_KEY_REFRESH_TOKEN } from '../../common/constants/redis-keys.constants';
import { BusinessException } from '../../common/exceptions/business.exception';
import { UserRepository } from '../user/user.repository';

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
  async loginUser(googleToken: string, lang = 'en'): Promise<any> {
    this.logger.log(`[AuthService] Starting loginUser...`);
    let googlePayload: any;
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken: googleToken,
        audience: this.config.get<string>('google.clientId')!,
      });
      googlePayload = ticket.getPayload();
      this.logger.log(`[AuthService] Google token verified | email=${googlePayload.email}`);
    } catch (err) {
      this.logger.error(`[AuthService] Google token verification FAILED | error=${err.message}`);
      throw new BusinessException('ERROR_LOGIN', 401);
    }

    let { email, name } = googlePayload;
    email = email.toLowerCase();

    let user = await this.userRepo.findByEmail(email);

    if (!user) {
      this.logger.log(`[AuthService] User NOT found, auto-registering... | email=${email}`);
      // Auto-register: valid Google account without an existing profile (username max 20 chars)
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
      this.logger.log(`[AuthService] Auto-registration SUCCESS | userId=${user._id}`);
    } else {
      this.logger.log(`[AuthService] User found | userId=${user._id} | status=${user.status}`);
    }

    if (user.status !== 'active') {
      this.logger.warn(`[AuthService] Login DENIED | user is not active | userId=${user._id}`);
      throw new BusinessException('ERROR_LOGIN', 401);
    }

    const accessTtl = this.config.get<number>('jwt.accessTtlSecs')!;
    const refreshTtl = this.config.get<number>('jwt.refreshTtlSecs')!;

    const userPayload = { id: user._id, email: user.email, username: user.username, name };
    const refreshPayload = { ...userPayload, hash: this.generateHash() };

    const token = await this.issueToken(userPayload, accessTtl, REDIS_KEY_ACCESS_TOKEN);
    const refreshToken = await this.issueToken(refreshPayload, refreshTtl, REDIS_KEY_REFRESH_TOKEN);
    
    this.logger.log(`[AuthService] Login SUCCESS | userId=${user._id} | Tokens issued`);
    return { success: true, messages: [], data: { token, refreshToken } };
  }

  // ─── Refresh Token ──────────────────────────────────────────────────────────
  async refreshToken(currentRefreshToken: string): Promise<any> {
    const exists = await this.redis.exists(`${REDIS_KEY_REFRESH_TOKEN}${currentRefreshToken}`);
    if (exists !== 1) throw new BusinessException('ERROR_AUTH', 401);

    let payload: any;
    try {
      payload = jwt.verify(currentRefreshToken, this.config.get<string>('jwt.secret')!);
    } catch {
      throw new BusinessException('ERROR_AUTH', 401);
    }

    await this.redis.del(`${REDIS_KEY_REFRESH_TOKEN}${currentRefreshToken}`);

    const accessTtl = this.config.get<number>('jwt.accessTtlSecs')!;
    const refreshTtl = this.config.get<number>('jwt.refreshTtlSecs')!;

    const userPayload = { id: payload.id, email: payload.email, username: payload.username, name: payload.name };
    const refreshPayload = { ...userPayload, hash: this.generateHash() };

    const token = await this.issueToken(userPayload, accessTtl, REDIS_KEY_ACCESS_TOKEN);
    const newRefreshToken = await this.issueToken(refreshPayload, refreshTtl, REDIS_KEY_REFRESH_TOKEN);

    return { success: true, messages: [], data: { token, refreshToken: newRefreshToken } };
  }

  // ─── Logout ─────────────────────────────────────────────────────────────────
  async logoutUser(accessToken: string, refreshToken: string): Promise<void> {
    try {
      await Promise.all([
        this.redis.del(`${REDIS_KEY_REFRESH_TOKEN}${refreshToken}`),
        this.redis.del(`${REDIS_KEY_ACCESS_TOKEN}${accessToken}`),
      ]);
    } catch (err) {
      this.logger.error(`Error during logout: ${err}`);
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────
  private async issueToken(payload: object, ttlSecs: number, redisPrefix: string): Promise<string> {
    const token = jwt.sign(payload, this.config.get<string>('jwt.secret')!, {
      expiresIn: ttlSecs,
    });
    await this.redis.setEx(`${redisPrefix}${token}`, ttlSecs, JSON.stringify(payload));
    return token;
  }

  private generateHash(): string {
    return Math.random().toString(36).substring(2, 15);
  }
}
