import { Connection, ClientSession, Types } from 'mongoose';
import Decimal from 'decimal.js';
import { fingerprint } from './canonical';
import { normalizePostings } from './ledger.service';
import { money, positiveMoney } from './money';

export function withdrawalAuthorization(order: any) {
  const authorization = { orderId: String(order._id), userId: String(order.userId), network: order.network ?? null,
    currency: String(order.currency), address: String(order.address), net: positiveMoney(String(order.net)),
    fee: money(String(order.fee ?? '0')), amount: positiveMoney(String(order.amount)) };
  if (!new Decimal(authorization.net).plus(authorization.fee).eq(authorization.amount)) throw new Error('WITHDRAWAL_TOTAL_MISMATCH');
  return authorization;
}
export async function assertWithdrawalAuthorization(db: Connection, order: any, session?: ClientSession, requireCoverage = false) {
  const expected = withdrawalAuthorization(order);
  const receipt = await db.collection('finance_requests').findOne({ 'authorization.orderId': expected.orderId,
    _id: { $regex: '^withdrawal:verify:' } as any }, { session });
  const journal = await db.collection('finance_journals').findOne({ operationId: `withdrawal:reserve:${expected.orderId}` }, { session });
  const postings = normalizePostings([
    { account: `user:${expected.userId}:available`, amount: new Decimal(expected.amount).negated().toFixed(6) },
    { account: `user:${expected.userId}:withdrawals`, amount: expected.amount },
  ]);
  if (!receipt || receipt.authorizationHash !== fingerprint(expected) || fingerprint(receipt.authorization) !== receipt.authorizationHash
    || !journal || journal.asset !== 'USDT' || journal.hash !== fingerprint(postings)
    || fingerprint(normalizePostings(journal.postings.map((p: any) => ({ account: p.account, amount: p.amount.toString() })))) !== journal.hash) {
    throw new Error('WITHDRAWAL_AUTHORIZATION_NOT_PROVEN');
  }
  if (requireCoverage) {
    const account = await db.collection('finance_accounts').findOne({ account: `user:${expected.userId}:withdrawals`, balance: { $gte: Types.Decimal128.fromString(expected.amount) } }, { session });
    if (!account) throw new Error('WITHDRAWAL_RESERVE_NOT_COVERED');
  }
}
