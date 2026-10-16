import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Connection, Types } from 'mongoose';
import { randomInt, randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import Decimal from 'decimal.js';
import { LedgerService } from './ledger.service';
import { NowPaymentsClient } from './nowpayments.client';
import { PaymentsPolicy } from './payments-policy.service';
import { fingerprint } from './canonical';
import { positiveMoney, money, reviewRequired } from './money';
import { EmailService } from '../../common/email/email.service';
import { assertFinanceEligibility } from './eligibility';
import { withdrawalAuthorization } from './withdrawal-authorization';

export function idempotencyKey(value?: string): string {
  if (!value || !/^[a-zA-Z0-9_-]{16,100}$/.test(value)) throw new BadRequestException('IDEMPOTENCY_KEY_REQUIRED');
  return value;
}
@Injectable()
export class PaymentsService implements OnModuleInit {
  constructor(@InjectConnection() private readonly db: Connection, private readonly ledger: LedgerService,
    private readonly provider: NowPaymentsClient, private readonly policy: PaymentsPolicy,
    private readonly config: ConfigService, private readonly email: EmailService) {}
  async onModuleInit() {
    const orders = this.db.collection('finance_orders');
    await orders.createIndex({ userId: 1, kind: 1, key: 1 }, { unique: true });
    await orders.createIndex({ providerId: 1, kind: 1 }, { unique: true, partialFilterExpression: { providerId: { $type: 'string' } } });
    await orders.createIndex({ userId: 1, reservedAt: 1 });
    await orders.createIndex({ status: 1, checkedAt: 1 });
    await this.db.collection('finance_ipn').createIndex({ hash: 1 }, { unique: true });
    await this.db.collection('finance_ipn').createIndex({ processed: 1, receivedAt: 1 });
    await this.db.collection('finance_challenges').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await this.db.collection('finance_eligibility').createIndex({ userId: 1 }, { unique: true });
    await this.db.collection('finance_requests').createIndex({ 'authorization.orderId': 1 }, { unique: true, sparse: true });
  }
  callback(): string {
    const url = this.config.get<string>('NOWPAYMENTS_IPN_URL') ?? '';
    if (!url.startsWith('https://')) throw new BadRequestException('IPN_HTTPS_URL_REQUIRED');
    return url;
  }
  async requestFundReturn(userId: string, rawKey: string, reason: string) {
    // A restricted country must not prevent a user from opening a supervised return case.
    // This does not bypass provider eligibility, authorize a payout or change balances.
    const key = idempotencyKey(rawKey);
    const id = `return:${userId}:${key}`;
    const hash = fingerprint({ reason });
    return this.ledger.transaction(async session => {
      const previous = await this.db.collection('finance_return_requests').findOne({ _id: id as any }, { session });
      if (previous) {
        if (previous.hash !== hash) throw new ConflictException('IDEMPOTENCY_CONFLICT');
        return { id, status: previous.status };
      }
      const user = await this.db.collection('users').findOne({ _id: new Types.ObjectId(userId) }, { session });
      if (!user) throw new BadRequestException('USER_NOT_FOUND');
      await this.db.collection('finance_return_requests').insertOne({ _id: id as any, userId, reason, hash,
        status: 'review', createdAt: new Date() }, { session });
      return { id, status: 'review' };
    });
  }
  async networks() {
    const configured = this.policy.networks();
    const response = await this.provider.merchantCoins();
    const coins: string[] = response.selectedCurrencies ?? response.currencies ?? [];
    if (!Array.isArray(coins) || coins.some(c => typeof c !== 'string')) throw new Error('INVALID_MERCHANT_COINS');
    // /merchant/coins returns uppercase tickers (USDTTRC20); our codes are lowercase.
    const enabled = new Set(coins.map(c => c.toLowerCase()));
    return Object.entries(configured).filter(([, code]) => enabled.has(code)).map(([network, currency]) => ({ network, currency, asset: 'USDT' }));
  }
  async currency(network: string): Promise<string> {
    const found = (await this.networks()).find(n => n.network === network);
    if (!found) throw new BadRequestException('USDT_NETWORK_UNAVAILABLE');
    return found.currency;
  }
  private expose(order: any) {
    return { id: String(order._id), kind: order.kind, asset: 'USDT', network: order.network,
      amount: order.amount, credited: order.credited, fee: order.fee, net: order.net, status: order.status,
      address: order.address, payAmount: order.payAmount, expiresAt: order.expiresAt,
      createdAt: order.createdAt, reviewReason: order.reviewReason };
  }
  async get(userId: string, id: string) {
    const order = await this.db.collection('finance_orders').findOne({ _id: new Types.ObjectId(id), userId });
    if (!order) throw new NotFoundException('PAYMENT_NOT_FOUND');
    return this.expose(order);
  }
  async history(userId: string) {
    return (await this.db.collection('finance_orders').find({ userId }).sort({ createdAt: -1 }).limit(100).toArray()).map(o => this.expose(o));
  }
  private async insertOrder(userId: string, kind: string, key: string, input: any) {
    const hash = fingerprint(input);
    const orders = this.db.collection('finance_orders');
    try {
      const order = { _id: new Types.ObjectId(), userId, kind, key: idempotencyKey(key), hash,
        ...input, status: 'created', createdAt: new Date() };
      await orders.insertOne(order);
      return order as any;
    } catch (err) {
      if ((err as any).code !== 11000) throw err;
      const existing = await orders.findOne({ userId, kind, key });
      if (!existing || existing.hash !== hash) throw new ConflictException('IDEMPOTENCY_CONFLICT');
      return existing;
    }
  }
  async deposit(userId: string, key: string, network: string, rawAmount: string) {
    this.policy.enabled('deposits');
    await this.policy.eligibility(userId);
    const amount = positiveMoney(rawAmount);
    const currency = await this.currency(network);
    const minimum = await this.provider.minimum(currency);
    if (new Decimal(amount).lt(String(minimum.min_amount))) throw new BadRequestException('DEPOSIT_BELOW_MINIMUM');
    const callback = this.callback();
    const order = await this.insertOrder(userId, 'deposit', key, { amount, network, currency });
    // The durable worker creates the provider payment under the shared merchant rate limit.
    return this.get(userId, String(order._id));
  }

  async receiveIpn(body: any, signature?: string) {
    if (!this.provider.verify(body, signature)) throw new UnauthorizedException('INVALID_IPN_SIGNATURE');
    const hash = fingerprint(body);
    await this.db.collection('finance_ipn').updateOne({ hash }, { $setOnInsert: {
      hash, body, receivedAt: new Date(), processed: false,
    } }, { upsert: true });
    return { accepted: true };
  }
  async quote(userId: string, network: string, address: string, rawNet: string) {
    this.policy.enabled('withdrawals');
    await this.policy.eligibility(userId);
    const net = positiveMoney(rawNet);
    const currency = await this.currency(network);
    await this.provider.validateAddress(currency, address);
    const result = await this.provider.payoutFee(currency, net);
    const fee = money(String(result.fee));
    const amount = money(new Decimal(net).plus(fee).toFixed(6));
    const quote = { _id: new Types.ObjectId(), userId, network, currency, address, net, fee, amount,
      expiresAt: new Date(Date.now() + 120000), createdAt: new Date() };
    await this.db.collection('finance_quotes').insertOne(quote);
    return { id: String(quote._id), network, address, net, fee, amount, expiresAt: quote.expiresAt };
  }
  async requestWithdrawal(userId: string, key: string, quoteId: string) {
    this.policy.enabled('withdrawals');
    await this.policy.eligibility(userId);
    const existing = await this.db.collection('finance_orders').findOne({ userId, kind: 'withdrawal', key: idempotencyKey(key) });
    if (existing) {
      if (existing.quoteId !== quoteId) throw new ConflictException('IDEMPOTENCY_CONFLICT');
      return this.expose(existing);
    }
    const quote = await this.db.collection('finance_quotes').findOne({ _id: new Types.ObjectId(quoteId), userId, expiresAt: { $gt: new Date() } });
    if (!quote) throw new BadRequestException('QUOTE_EXPIRED');
    const user = await this.db.collection('users').findOne({ _id: new Types.ObjectId(userId), status: 'active' });
    if (!user?.email) throw new BadRequestException('USER_NOT_ACTIVE');
    const order = await this.insertOrder(userId, 'withdrawal', key, { quoteId, network: quote.network,
      currency: quote.currency, address: quote.address, net: quote.net, fee: quote.fee, amount: quote.amount });
    const code = randomInt(100000, 1000000).toString();
    const hash = await bcrypt.hash(code, 10);
    const installed = await this.ledger.transaction(async session => {
      const claimed = await this.db.collection('finance_orders').updateOne({ _id: order._id, status: 'created' },
        { $set: { status: 'pending_verify', verificationExpiresAt: new Date(Date.now() + 10 * 60000) } }, { session });
      if (!claimed.modifiedCount) return false;
      await this.db.collection('finance_challenges').insertOne({ orderId: String(order._id), userId, hash,
        attempts: 0, expiresAt: new Date(Date.now() + 10 * 60000) }, { session });
      return true;
    });
    if (installed) {
      // Failure is explicit, never roll back an already consumed challenge or financial reservation.
      try { await this.email.sendWithdrawalVerification(user.email, user.username, code, 10, 'es', { network: order.network, address: order.address, amount: order.amount, net: order.net, fee: order.fee }); }
      catch {
        await this.db.collection('finance_orders').updateOne({ _id: order._id, status: 'pending_verify' },
          { $set: { status: 'verification_delivery_failed' } });
      }
    }
    return this.get(userId, String(order._id));
  }
  async verifyWithdrawal(userId: string, id: string, code: string, rawKey: string) {
    const requestId = `withdrawal:verify:${userId}:${idempotencyKey(rawKey)}`;
    // Authentication codes are credentials, not operation content. The immutable withdrawal defines destination and amount.
    const hash = fingerprint({ orderId: id });
    const previous = await this.db.collection('finance_requests').findOne({ _id: requestId as any });
    if (previous) {
      if (previous.hash !== hash) throw new ConflictException('IDEMPOTENCY_CONFLICT');
      return previous.result;
    }
    this.policy.enabled('withdrawals');
    await this.policy.eligibility(userId);
    // Claim an attempt BEFORE expensive verification; concurrent guesses also count.
    const challenge = await this.db.collection('finance_challenges').findOneAndUpdate({
      orderId: id, userId, consumed: { $ne: true }, expiresAt: { $gt: new Date() }, attempts: { $lt: 5 },
    }, { $inc: { attempts: 1 } }, { returnDocument: 'after' });
    if (!challenge || !await bcrypt.compare(code, challenge.hash)) {
      const completed = await this.db.collection('finance_requests').findOne({ _id: requestId as any });
      if (completed?.hash === hash) return completed.result;
      throw new BadRequestException('INVALID_VERIFICATION_CODE');
    }
    return this.ledger.transaction(async session => {
      const completed = await this.db.collection('finance_requests').findOne({ _id: requestId as any }, { session });
      if (completed) {
        if (completed.hash !== hash) throw new ConflictException('IDEMPOTENCY_CONFLICT');
        return completed.result;
      }
      const order = await this.db.collection('finance_orders').findOne({ _id: new Types.ObjectId(id), userId, status: 'pending_verify' }, { session });
      if (!order) throw new ConflictException('WITHDRAWAL_ALREADY_PROCESSED');
      const claimed = await this.db.collection('finance_challenges').updateOne({ _id: challenge._id,
        consumed: { $ne: true }, expiresAt: { $gt: new Date() }, attempts: { $lte: 5 } }, { $set: { consumed: true } }, { session });
      if (!claimed.modifiedCount) throw new ConflictException('VERIFICATION_ALREADY_USED');
      // Shared user account update serializes concurrent reservations across requests/pods.
      await this.ledger.post(`withdrawal:reserve:${id}`, [
        { account: `user:${userId}:available`, amount: new Decimal(order.amount).negated().toFixed(6) },
        { account: `user:${userId}:withdrawals`, amount: order.amount },
      ], session);
      const prior = await this.db.collection('finance_orders').find({ userId, kind: 'withdrawal',
        $or: [
          { status: { $in: ['review', 'reserved', 'submitting', 'processing', 'verification_pending', 'uncertain'] }, reservedAt: { $exists: true } },
          { status: 'confirmed', $or: [{ confirmedAt: { $gte: new Date(Date.now() - 86400000) } },
            { confirmedAt: { $exists: false }, reservedAt: { $gte: new Date(Date.now() - 86400000) } }] },
        ] }, { session }).toArray();
      const total = prior.reduce((sum, o) => sum.plus(o.amount), new Decimal(0));
      const evidence = await assertFinanceEligibility(this.db, userId, session);
      const review = reviewRequired(order.amount, total.toFixed(6), evidence.risk === true);
      await this.db.collection('finance_orders').updateOne({ _id: order._id }, { $set: {
        status: review ? 'review' : 'reserved', reservedAt: new Date(),
        reviewReason: review ? (evidence.risk ? 'risk' : 'limit') : null,
      } }, { session });
      const result = JSON.parse(JSON.stringify(this.expose({ ...order, status: review ? 'review' : 'reserved', reviewReason: review ? (evidence.risk ? 'risk' : 'limit') : null })));
      const authorization = withdrawalAuthorization(order);
      await this.db.collection('finance_requests').insertOne({ _id: requestId as any, hash, result, authorization, authorizationHash: fingerprint(authorization), createdAt: new Date() }, { session });
      return result;
    });
  }
}
