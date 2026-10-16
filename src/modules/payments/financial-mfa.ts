import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Connection, ClientSession } from 'mongoose';
import { timingSafeEqual } from 'crypto';
import { totp } from './totp';
export async function consumeFinancialMfa(db: Connection, config: ConfigService, adminId: string, code: string, session: ClientSession) {
  if (!/^\d{6}$/.test(code ?? '')) throw new UnauthorizedException('INVALID_FINANCIAL_MFA');
  const seeds = JSON.parse(config.get<string>('FINANCE_ADMIN_TOTP_SECRETS') ?? '{}');
  const seed = seeds[adminId];
  if (!seed) throw new UnauthorizedException('FINANCIAL_MFA_NOT_CONFIGURED');
  const now = Date.now(); let counter: number | null = null;
  for (const drift of [-30000, 0, 30000]) {
    if (timingSafeEqual(Buffer.from(totp(seed, now + drift)), Buffer.from(code))) counter = Math.floor((now + drift) / 30000);
  }
  if (counter === null) throw new UnauthorizedException('INVALID_FINANCIAL_MFA');
  await db.collection('finance_mfa_uses').insertOne({ _id: `${adminId}:${counter}` as any, adminId, createdAt: new Date() }, { session });
}
