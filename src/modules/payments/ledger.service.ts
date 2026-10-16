import { ConflictException, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ClientSession, Connection, Types } from 'mongoose';
import Decimal from 'decimal.js';
import { bsonMoney, money } from './money';
import { commandContext } from '../../common/reliable-commands/context';
import { fingerprint } from './canonical';

export interface Posting { account: string; amount: string }
export function normalizePostings(postings: Posting[]): Posting[] {
  if (postings.length < 2 || postings.length > 100) throw new Error('INVALID_POSTINGS');
  const seen = new Set<string>();
  const normalized = postings.map(p => {
    if (!/^(user:[a-f0-9]{24}:(available|withdrawals)|escrow:[a-zA-Z0-9:_-]+|house:[a-zA-Z0-9:_-]+|external:(nowpayments|opening))$/.test(p.account)
      || seen.has(p.account)) throw new Error('INVALID_LEDGER_ACCOUNT');
    seen.add(p.account);
    return { account: p.account, amount: money(p.amount, true) };
  }).sort((a, b) => a.account.localeCompare(b.account));
  if (!normalized.reduce((sum, p) => sum.plus(p.amount), new Decimal(0)).isZero()) throw new Error('UNBALANCED_JOURNAL');
  if (normalized.every(p => new Decimal(p.amount).isZero())) throw new Error('EMPTY_JOURNAL');
  return normalized;
}

/** Append-only API. Corrections are compensating journals, never edits. */
@Injectable()
export class LedgerService implements OnModuleInit {
  constructor(@InjectConnection() private readonly db: Connection) {}
  async onModuleInit() {
    await this.db.collection('finance_journals').createIndex({ operationId: 1 }, { unique: true });
    await this.db.collection('finance_accounts').createIndex({ account: 1 }, { unique: true });
  }
  async transaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
    const context = commandContext.getStore();
    if (context) return work(context.session);
    const session = await this.db.startSession();
    try { return await session.withTransaction(() => work(session), {
      readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, readPreference: 'primary',
    }) as T; } finally { await session.endSession(); }
  }
  async post(operationId: string, postings: Posting[], session: ClientSession): Promise<void> {
    if (!session.inTransaction()) throw new Error('LEDGER_REQUIRES_TRANSACTION');
    if (!operationId || operationId.length > 200) throw new Error('INVALID_OPERATION_ID');
    const normalized = normalizePostings(postings);
    for (const p of normalized) {
      if (p.account.startsWith('user:')) await this.initializeUser(p.account.split(':')[1], session);
    }
    const hash = fingerprint(normalized);
    const journals = this.db.collection('finance_journals');
    const existing = await journals.findOne({ operationId }, { session });
    if (existing) {
      if (existing.hash !== hash) throw new ConflictException('IDEMPOTENCY_CONFLICT');
      return;
    }
    await journals.insertOne({ operationId, hash, asset: 'USDT', createdAt: new Date(),
      postings: normalized.map(p => ({ account: p.account, amount: bsonMoney(p.amount) })) }, { session });
    for (const p of normalized) {
      const amount = new Decimal(p.amount);
      const external = p.account.startsWith('external:');
      const filter: any = { account: p.account };
      if (amount.isNegative() && !external) filter.balance = { $gte: bsonMoney(amount.negated().toFixed(6)) };
      const result = await this.db.collection('finance_accounts').updateOne(filter,
        { $inc: { balance: bsonMoney(p.amount) }, $set: { updatedAt: new Date() } },
        { session, upsert: external || !amount.isNegative() });
      if (!result.matchedCount && !result.upsertedCount) throw new ConflictException('INSUFFICIENT_BALANCE');
      if (p.account.endsWith(':available')) {
        const account = await this.db.collection('finance_accounts').findOne({ account: p.account }, { session });
        await this.db.collection('users').updateOne({ _id: new Types.ObjectId(p.account.split(':')[1]) },
          { $set: { balance: account!.balance } }, { session });
      }
    }
  }
  private async initializeUser(userId: string, session: ClientSession): Promise<void> {
    const user = await this.db.collection('users').findOne({ _id: new Types.ObjectId(userId) }, { session });
    if (!user) throw new ConflictException('LEDGER_USER_NOT_FOUND');
    if (user.finance_v2_initialized) return;
    const initial = money(String(user.balance ?? '0'));
    await this.db.collection('users').updateOne({ _id: user._id },
      { $set: { finance_v2_initialized: true, balance: bsonMoney(initial) } }, { session });
    if (!new Decimal(initial).isZero()) await this.post(`opening:user:${userId}`, [
      { account: 'external:opening', amount: new Decimal(initial).negated().toFixed(6) },
      { account: `user:${userId}:available`, amount: initial },
    ], session);
  }
  async balances(userId: string) {
    const rows = await this.db.collection('finance_accounts').find({ account: { $in: [
      `user:${userId}:available`, `user:${userId}:withdrawals`,
    ] } }).toArray();
    const get = (kind: string) => rows.find(r => r.account === `user:${userId}:${kind}`)?.balance?.toString() ?? '0.000000';
    const user = await this.db.collection('users').findOne({ _id: new Types.ObjectId(userId) });
    const available = !user?.finance_v2_initialized ? money(String(user?.balance ?? '0')) : get('available');
    return { asset: 'USDT', available, reserved: get('withdrawals') };
  }
}
