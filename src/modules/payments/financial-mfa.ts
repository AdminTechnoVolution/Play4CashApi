import { ForbiddenException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Connection, ClientSession } from 'mongoose';
import { timingSafeEqual } from 'crypto';
import { totp } from './totp';

const logger = new Logger('FinancialMfa');

// 403, not 401: the admin session is valid, only the second factor failed. A 401 would make the
// admin client refresh its token and resend the request.
export async function consumeFinancialMfa(db: Connection, config: ConfigService, adminId: string, code: string, session: ClientSession) {
  if (!/^\d{6}$/.test(code ?? '')) throw new ForbiddenException('INVALID_FINANCIAL_MFA');
  const seed = adminSeed(config, adminId);
  const now = Date.now(); let counter: number | null = null;
  for (const drift of [-30000, 0, 30000]) {
    if (timingSafeEqual(Buffer.from(totp(seed, now + drift)), Buffer.from(code))) counter = Math.floor((now + drift) / 30000);
  }
  if (counter === null) throw new ForbiddenException('INVALID_FINANCIAL_MFA');
  try {
    await db.collection('finance_mfa_uses').insertOne({ _id: `${adminId}:${counter}` as any, adminId, createdAt: new Date() }, { session });
  } catch (error) {
    // Each TOTP counter is single-use: a repeated code is a rejected code, not a server error.
    if ((error as { code?: number }).code === 11000) throw new ForbiddenException('INVALID_FINANCIAL_MFA');
    throw error;
  }
}

function adminSeed(config: ConfigService, adminId: string): string {
  let seed: unknown;
  try {
    seed = JSON.parse(config.get<string>('FINANCE_ADMIN_TOTP_SECRETS') ?? '{}')?.[adminId];
    if (seed) totp(String(seed));
  } catch (error) {
    logger.error(`FINANCE_ADMIN_TOTP_SECRETS is invalid: ${(error as Error).message}`);
    throw new ForbiddenException('FINANCIAL_MFA_NOT_CONFIGURED');
  }
  if (!seed) throw new ForbiddenException('FINANCIAL_MFA_NOT_CONFIGURED');
  return String(seed);
}
