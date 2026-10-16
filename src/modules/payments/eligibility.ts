import { ForbiddenException } from '@nestjs/common';
import { Connection, ClientSession, Types } from 'mongoose';

/** Sandbox uses active P4C accounts, without a P4C country allowlist or mandatory geo feed.
 * Provider calls remain subject to the provider's own checks. Never fabricate KYC evidence.
 * Trusted risk flags are still consulted when deciding whether a withdrawal needs review.
 */
export async function assertFinanceEligibility(db: Connection, userId: string, session?: ClientSession) {
  if (!Types.ObjectId.isValid(userId)) throw new ForbiddenException('PAYMENTS_USER_NOT_ACTIVE');
  const user = await db.collection('users').findOne({ _id: new Types.ObjectId(userId), status: 'active' }, { session });
  if (!user) throw new ForbiddenException('PAYMENTS_USER_NOT_ACTIVE');
  const evidence = await db.collection('finance_eligibility').findOne({ userId }, { session });
  // Sandbox need not have KYC provisioned; explicit evidence of a minor still blocks access.
  if (evidence?.adultVerified === false) throw new ForbiddenException('PAYMENTS_ADULT_REQUIRED');
  return { risk: evidence?.risk === true };
}
