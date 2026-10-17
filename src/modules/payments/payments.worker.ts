import { Injectable, Logger } from '@nestjs/common';
import { Cron, Interval } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, Types } from 'mongoose';
import Decimal from 'decimal.js';
import { NowPaymentsClient, NowPaymentsRejectedError } from './nowpayments.client';
import { LedgerService } from './ledger.service';
import { PaymentsService } from './payments.service';
import { positiveMoney } from './money';
import { refundCancelledParticipant } from './tournament-finance';
import { assertWithdrawalAuthorization, withdrawalAuthorization } from './withdrawal-authorization';
import { fingerprint } from './canonical';
import { settleGameRoom } from './game-finance';
import { totp } from './totp';
import { DEFAULT_USDT_NETWORKS } from './payments-policy.service';

// NOWPayments settles every payment into the merchant's payout currency (e.g. USDTBSC deposits into USDTTRC20).
// The ledger holds one USDT balance, so any USDT network is an acceptable settlement; nothing else is ever credited.
const USDT_SETTLEMENTS = new Set<string>(Object.values(DEFAULT_USDT_NETWORKS));

/** NOWPayments' quote of what settles after fees. Display-only: the ledger always credits the final outcome_amount. */
function expectedCredit(value: unknown): { expectedCredit?: string } {
  try { return { expectedCredit: positiveMoney(new Decimal(String(value)).toDecimalPlaces(6, Decimal.ROUND_DOWN).toFixed(6)) }; }
  catch { return {}; }
}

@Injectable()
export class PaymentsWorker {
  private readonly logger = new Logger(PaymentsWorker.name);
  private running = false;
  private draining = false;
  constructor(@InjectConnection() private readonly db: Connection, private readonly config: ConfigService,
    private readonly provider: NowPaymentsClient, private readonly ledger: LedgerService,
    private readonly payments: PaymentsService) {}

  @Interval(500)
  async drain() {
    if (this.draining || this.config.get('PAYMENTS_WORKER') !== 'true') return;
    this.draining = true;
    try {
      const [deposits, withdrawals] = await Promise.all([
        this.config.get('PAYMENTS_DEPOSITS_ENABLED') === 'true' ? this.db.collection('finance_orders').find({ kind: 'deposit', status: 'created' }).sort({ createdAt: 1 }).limit(2).toArray() : [],
        this.config.get('PAYMENTS_WITHDRAWALS_ENABLED') === 'true' ? this.db.collection('finance_orders').find({ kind: 'withdrawal', status: 'reserved', $or: [{ liquidityRetryAt: { $exists: false } }, { liquidityRetryAt: { $lte: new Date() } }] }).sort({ checkedAt: 1, createdAt: 1 }).limit(1).toArray() : [],
      ]);
      const queued = [...deposits, ...withdrawals];
      for (const order of queued) {
        try {
          if (order.kind === 'deposit') await this.submitDeposit(order);
          else await this.submitWithdrawal(order);
        } catch { this.logger.warn(`event=payment_queue_deferred id=${order._id}`); }
      }
    } finally { this.draining = false; }
  }
  async submitDeposit(order: any) {
    if (this.config.get('PAYMENTS_DEPOSITS_ENABLED') !== 'true') return;
    const callback = this.payments.callback();
    if (!await this.provider.claimSubmissionSlot('deposit')) return;
    const claimed = await this.db.collection('finance_orders').findOneAndUpdate({ _id: order._id, status: 'created' },
      { $set: { status: 'submitting', submittedAt: new Date() } }, { returnDocument: 'after' });
    if (!claimed) return;
    try {
      const result = await this.provider.createDeposit(String(order._id), order.amount, order.currency, callback);
      if (!result.payment_id || !result.pay_address || result.pay_currency !== order.currency) throw new Error('INVALID_PROVIDER_PAYMENT');
      await this.db.collection('finance_orders').updateOne({ _id: order._id, status: 'submitting' }, { $set: {
        providerId: String(result.payment_id), address: result.pay_address,
        payAmount: positiveMoney(String(result.pay_amount)), status: 'waiting', ...expectedCredit(result.amount_received),
      } });
    } catch (error) {
      const rejected = error instanceof NowPaymentsRejectedError ? error : null;
      await this.db.collection('finance_orders').updateOne({ _id: order._id, status: 'submitting' },
        { $set: { status: rejected ? 'rejected' : 'uncertain', reviewReason: rejected ? 'provider_rejected' : 'provider_result_unknown',
          ...(rejected ? { providerError: rejected.reason } : {}) } });
      this.logger.error(rejected ? `event=deposit_provider_rejected id=${order._id} ${rejected.describe()}`
        : `event=deposit_creation_uncertain id=${order._id}`);
    }
  }

  @Cron('0 * * * * *')
  async tick() {
    if (this.running || this.config.get('PAYMENTS_WORKER') !== 'true') return;
    this.running = true;
    try {
      await this.db.collection('finance_orders').updateMany({ status: 'pending_verify', verificationExpiresAt: { $lte: new Date() } }, { $set: { status: 'expired' } });
      const stalled = await this.db.collection('finance_orders').countDocuments({ reservedAt: { $lte: new Date(Date.now() - 900000) },
        status: { $in: ['reserved', 'review', 'submitting', 'processing', 'verification_pending', 'uncertain'] } });
      if (stalled) this.logger.error(`event=withdrawal_reservations_stalled count=${stalled}`);
      if (process.env.FINANCE_V2_ENABLED === 'true') {
        const cancelled = await this.db.collection('tournaments').find({ status: 'cancelled' }).limit(30).toArray();
        for (const tournament of cancelled) {
          const participants = await this.db.collection('tournamentparticipants').find({ tournament_id: tournament._id, status: { $ne: 'refunded' } }).limit(100).toArray();
          for (const participant of participants) {
            try { await refundCancelledParticipant(this.db, String(tournament._id), String(participant.user_id)); }
            catch { this.logger.error(`event=tournament_refund_pending tournament=${tournament._id}`); }
          }
        }
        const rooms = await this.db.collection('rooms').find({ status: 'finished', source: { $ne: 'tournament' },
          finance_settled: { $ne: true } }).sort({ finished_at: 1 }).limit(30).toArray();
        for (const room of rooms) {
          try { await settleGameRoom(this.db, String(room._id)); }
          catch { this.logger.error(`event=game_settlement_pending room=${room._id}`); }
        }
      }
      const resolutions = await this.db.collection('finance_resolution_requests').find({ status: 'pending' }).sort({ checkedAt: 1, createdAt: 1 }).limit(10).toArray();
      for (const request of resolutions) {
        try { await this.resolveUncertain(request); }
        catch { this.logger.warn(`event=payment_resolution_pending id=${request._id}`); }
        finally { await this.db.collection('finance_resolution_requests').updateOne({ _id: request._id }, { $set: { checkedAt: new Date() } }); }
      }
      const inbox = await this.db.collection('finance_ipn').find({ processed: false }).sort({ receivedAt: 1 }).limit(30).toArray();
      for (const event of inbox) {
        try {
          // Treat IPNs as a wake-up signal; authoritative amounts/status come from the provider API.
          const body = event.body;
          if (body.payment_id) {
            const order = await this.db.collection('finance_orders').findOne({ kind: 'deposit', $or: [
              { providerId: String(body.payment_id) },
              ...(Types.ObjectId.isValid(body.order_id ?? '') ? [{ _id: new Types.ObjectId(body.order_id) }] : []),
            ] });
            if (!order) throw new Error('UNMATCHED_IPN');
            await this.reconcileDeposit(order, String(body.payment_id));
          } else if (body.id) {
            const order = await this.db.collection('finance_orders').findOne({ kind: 'withdrawal', providerId: String(body.id) });
            if (!order) throw new Error('UNMATCHED_PAYOUT_IPN');
            await this.reconcileWithdrawal(order);
          } else throw new Error('UNKNOWN_IPN');
          await this.db.collection('finance_ipn').updateOne({ _id: event._id }, { $set: { processed: true, processedAt: new Date() } });
        } catch { this.logger.warn(`event=payment_ipn_pending id=${event._id}`); }
      }
      const orders = await this.db.collection('finance_orders').find({
        status: { $in: ['reserved', 'submitting', 'uncertain', 'waiting', 'confirming', 'partially_paid', 'verification_pending', 'processing'] },
      }).sort({ checkedAt: 1, createdAt: 1 }).limit(30).toArray();
      for (const order of orders) {
        try {
          if (order.kind === 'deposit' && order.providerId) await this.reconcileDeposit(order, order.providerId);
          else if (order.kind === 'withdrawal' && order.status === 'reserved') await this.submitWithdrawal(order);
          else if (order.kind === 'withdrawal' && order.providerId) await this.reconcileWithdrawal(order);
          else if (order.submittedAt && Date.now() - order.submittedAt.getTime() > 60000) {
            await this.db.collection('finance_orders').updateOne({ _id: order._id, status: { $in: ['submitting', 'uncertain'] } },
              { $set: { status: 'uncertain', reviewReason: 'provider_result_unknown' } });
            this.logger.error(`event=payment_uncertain id=${order._id}`);
          }
        } catch { this.logger.warn(`event=payment_reconcile_pending id=${order._id}`); }
        finally { await this.db.collection('finance_orders').updateOne({ _id: order._id }, { $set: { checkedAt: new Date() } }); }
      }
    } finally { this.running = false; }
  }

  async reconcileDeposit(order: any, providerId: string) {
    const payment = await this.provider.deposit(providerId);
    if (String(payment.payment_id) !== providerId || payment.order_id !== String(order._id)
      || payment.pay_currency !== order.currency) throw new Error('PROVIDER_DEPOSIT_MISMATCH');
    if (payment.payment_status !== 'finished') {
      if (!['waiting', 'confirming', 'confirmed', 'sending', 'partially_paid', 'expired', 'failed', 'refunded'].includes(payment.payment_status)) return;
      await this.db.collection('finance_orders').updateOne({ _id: order._id, status: { $nin: ['confirmed', 'review'] } },
        { $set: { providerId, status: payment.payment_status === 'confirmed' ? 'confirming' : payment.payment_status } });
      return;
    }
    if (!USDT_SETTLEMENTS.has(String(payment.outcome_currency).toLowerCase())) throw new Error('SETTLEMENT_CURRENCY_MISMATCH');
    const settled = positiveMoney(String(payment.outcome_amount));
    await this.ledger.transaction(async session => {
      const current = await this.db.collection('finance_orders').findOne({ _id: order._id }, { session });
      if (!current) throw new Error('ORDER_NOT_FOUND');
      if (current.status === 'confirmed') {
        if (current.credited !== settled) throw new Error('SETTLED_AMOUNT_CHANGED');
        return;
      }
      if (current.status === 'review') return;
      await this.ledger.post(`deposit:${order._id}`, [
        { account: 'external:nowpayments', amount: new Decimal(settled).negated().toFixed(6) },
        { account: `user:${order.userId}:available`, amount: settled },
      ], session);
      await this.db.collection('users').updateOne({ _id: new Types.ObjectId(order.userId) }, { $inc: { total_recharged: Types.Decimal128.fromString(settled) } }, { session });
      await this.db.collection('finance_orders').updateOne({ _id: order._id }, { $set: {
        providerId, status: 'confirmed', credited: settled, settledCurrency: String(payment.outcome_currency).toLowerCase(), confirmedAt: new Date(),
        amountRelation: new Decimal(payment.actually_paid).cmp(payment.pay_amount),
      } }, { session });
    });
  }

  async resolveUncertain(request: any) {
    const order = await this.db.collection('finance_orders').findOne({ _id: new Types.ObjectId(request.orderId), status: 'uncertain' });
    if (!order || order.providerId) {
      await this.db.collection('finance_resolution_requests').updateOne({ _id: request._id, status: 'pending' }, { $set: { status: 'obsolete', completedAt: new Date() } });
      return;
    }
    const result = order.kind === 'deposit' ? await this.provider.deposit(request.providerId)
      : await this.provider.payout(request.providerId, await this.provider.authenticate());
    // Address and amount alone are insufficient: a different payout could have the same values.
    const identityMatches = order.kind === 'deposit'
      ? String(result.payment_id) === request.providerId && result.order_id === String(order._id) && result.pay_currency === order.currency
      : String(result.id) === request.providerId && result.unique_external_id === String(order._id)
        && result.currency === order.currency && result.address === order.address && new Decimal(String(result.amount)).eq(order.net);
    if (!identityMatches) {
      await this.db.collection('finance_resolution_requests').updateOne({ _id: request._id, status: 'pending' },
        { $set: { status: 'rejected', reasonCode: 'PROVIDER_IDENTITY_NOT_PROVEN', completedAt: new Date() } });
      return;
    }
    await this.ledger.transaction(async session => {
      const bound = await this.db.collection('finance_orders').updateOne({ _id: order._id, status: 'uncertain', providerId: { $exists: false } },
        { $set: { providerId: request.providerId, ...(result.batch_withdrawal_id ? { batchId: String(result.batch_withdrawal_id) } : {}), resolutionRequestId: request._id } }, { session });
      if (!bound.modifiedCount) return;
      await this.db.collection('finance_resolution_requests').updateOne({ _id: request._id, status: 'pending' },
        { $set: { status: 'verified', completedAt: new Date() } }, { session });
      await this.db.collection('finance_admin_audit').insertOne({ orderId: request.orderId, adminId: request.adminId,
        decision: 'bind_verified_provider_id', providerId: request.providerId, reason: request.reason, createdAt: new Date() }, { session });
    });
    // Normal reconciliation applies confirmed provider results; binding alone never moves money.
  }

  async submitWithdrawal(order: any) {
    if (this.config.get('PAYMENTS_WITHDRAWALS_ENABLED') !== 'true') return;
    const current = await this.db.collection('finance_orders').findOne({ _id: order._id, status: 'reserved' });
    if (!current || (current.liquidityRetryAt && current.liquidityRetryAt > new Date())) return;
    try { await assertWithdrawalAuthorization(this.db, current, undefined, true); }
    catch {
      await this.db.collection('finance_orders').updateOne({ _id: current._id, status: 'reserved' },
        { $set: { status: 'review', reviewReason: 'authorization_not_proven' } });
      this.logger.error(`event=payout_authorization_not_proven id=${current._id}`);
      return;
    }
    const seed = this.config.get<string>('NOWPAYMENTS_PAYOUT_TOTP_SECRET');
    if (!seed) throw new Error('WORKER_TOTP_REQUIRED');
    // Check before claiming so local configuration/auth failures cannot mark an unsent payment uncertain.
    if (!await this.provider.claimSubmissionSlot('payout')) return;
    const token = await this.provider.authenticate();
    const callback = this.payments.callback();
    const fee = await this.provider.payoutFee(order.currency, order.net);
    if (!new Decimal(String(fee.fee)).eq(order.fee)) {
      await this.db.collection('finance_orders').updateOne({ _id: order._id, status: 'reserved' },
        { $set: { status: 'review', reviewReason: 'fee_changed' } });
      return;
    }
    const balances = await this.provider.balances();
    const balance = balances?.[order.currency]?.amount;
    if (balance === undefined || !new Decimal(String(balance)).isFinite() || new Decimal(String(balance)).isNegative()) {
      throw new Error('PROVIDER_LIQUIDITY_UNVERIFIED');
    }
    if (new Decimal(String(balance)).lt(order.amount)) {
      await this.db.collection('finance_orders').updateOne({ _id: order._id, status: 'reserved' },
        { $set: { liquidityRetryAt: new Date(Date.now() + 60000), liquidityBlockedAt: new Date() } });
      this.logger.error(`event=payout_low_liquidity currency=${order.currency}`);
      return;
    }
    const claimed = await this.ledger.transaction(async session => {
      const latest = await this.db.collection('finance_orders').findOne({ _id: order._id, status: 'reserved' }, { session });
      if (!latest) return null;
      await assertWithdrawalAuthorization(this.db, latest, session, true);
      if (fingerprint(withdrawalAuthorization(latest)) !== fingerprint(withdrawalAuthorization(order))) throw new Error('WITHDRAWAL_CHANGED_BEFORE_SUBMISSION');
      return this.db.collection('finance_orders').findOneAndUpdate({ _id: order._id, status: 'reserved' },
        { $set: { status: 'submitting', submittedAt: new Date() } }, { session, returnDocument: 'after' });
    });
    if (!claimed) return;
    try {
      const batch = await this.provider.createPayout(String(order._id), order.currency, order.address, order.net, callback, token);
      const payout = batch.withdrawals?.[0];
      if (!batch.id || !payout?.id) throw new Error('INVALID_PAYOUT_RESPONSE');
      // Persist IDs BEFORE verification; retry verification, never creation.
      await this.db.collection('finance_orders').updateOne({ _id: order._id, status: 'submitting' },
        { $set: { providerId: String(payout.id), batchId: String(batch.id), status: 'verification_pending' } });
      await this.provider.verifyPayout(String(batch.id), totp(seed), token);
      await this.db.collection('finance_orders').updateOne({ _id: order._id, status: 'verification_pending' }, { $set: { status: 'processing' } });
    } catch (error) {
      if (error instanceof NowPaymentsRejectedError) {
        const rejected = await this.ledger.transaction(async session => {
          const current = await this.db.collection('finance_orders').findOne({ _id: order._id, status: 'submitting' }, { session });
          // A batch ID already persisted means verification failed: reconcile that batch, never refund here.
          if (!current || current.providerId || current.batchId) return false;
          await assertWithdrawalAuthorization(this.db, current, session);
          await this.ledger.post(`withdrawal:provider-reject:${order._id}`, [
            { account: `user:${current.userId}:withdrawals`, amount: new Decimal(current.amount).negated().toFixed(6) },
            { account: `user:${current.userId}:available`, amount: current.amount },
          ], session);
          await this.db.collection('finance_orders').updateOne({ _id: order._id, status: 'submitting' },
            { $set: { status: 'rejected', reviewReason: 'provider_rejected', rejectedAt: new Date(), providerError: error.reason } }, { session });
          return true;
        });
        if (rejected) { this.logger.warn(`event=payout_provider_rejected id=${order._id} ${error.describe()}`); return; }
      }
      await this.db.collection('finance_orders').updateOne({ _id: order._id, status: 'submitting' }, { $set: { status: 'uncertain' } });
      this.logger.error(`event=payout_requires_reconciliation id=${order._id}`);
    }
  }

  async reconcileWithdrawal(order: any) {
    await assertWithdrawalAuthorization(this.db, order);
    const token = await this.provider.authenticate();
    const result = await this.provider.payout(order.providerId, token);
    if (String(result.id) !== order.providerId || result.currency !== order.currency || result.address !== order.address
      || !new Decimal(String(result.amount)).eq(order.net)) throw new Error('PAYOUT_MISMATCH');
    const status = String(result.status ?? result.payout_status).toLowerCase();
    if (order.status === 'verification_pending' && ['new', 'creating', 'waiting'].includes(status)) {
      const seed = this.config.get<string>('NOWPAYMENTS_PAYOUT_TOTP_SECRET');
      if (!seed || this.config.get('PAYMENTS_WITHDRAWALS_ENABLED') !== 'true') return;
      await this.provider.verifyPayout(order.batchId, totp(seed), token);
    }
    if (!['finished', 'rejected', 'cancelled'].includes(status)) return;
    await this.ledger.transaction(async session => {
      const claimed = await this.db.collection('finance_orders').findOneAndUpdate({ _id: order._id,
        status: { $in: ['verification_pending', 'processing', 'uncertain'] } },
        { $set: { status: status === 'finished' ? 'confirmed' : 'rejected', confirmedAt: new Date() } }, { session, returnDocument: 'after' });
      if (!claimed) return;
      if (status === 'finished') await this.db.collection('users').updateOne({ _id: new Types.ObjectId(order.userId) }, { $inc: { total_witdrawal: Types.Decimal128.fromString(order.amount) } }, { session });
      await this.ledger.post(`withdrawal:settle:${order._id}`, [
        { account: `user:${order.userId}:withdrawals`, amount: new Decimal(order.amount).negated().toFixed(6) },
        { account: status === 'finished' ? 'external:nowpayments' : `user:${order.userId}:available`, amount: order.amount },
      ], session);
    });
  }

  @Cron('0 0 3 * * *', { timeZone: 'UTC' })
  async audit() {
    if (this.config.get('PAYMENTS_WORKER') !== 'true') return;
    const expected = new Map<string, Decimal>();
    for await (const journal of this.db.collection('finance_journals').find({})) {
      let total = new Decimal(0);
      for (const posting of journal.postings) {
        const amount = new Decimal(posting.amount.toString());
        total = total.plus(amount);
        expected.set(posting.account, (expected.get(posting.account) ?? new Decimal(0)).plus(amount));
      }
      if (!total.isZero()) this.logger.error(`event=journal_imbalance id=${journal._id}`);
    }
    const mismatches: Array<{ account: string; difference: string }> = [];
    let difference = new Decimal(0);
    for await (const account of this.db.collection('finance_accounts').find({})) {
      const actual = new Decimal(account.balance.toString());
      const delta = actual.minus(expected.get(account.account) ?? 0);
      difference = difference.plus(actual);
      if (!delta.isZero()) mismatches.push({ account: account.account, difference: delta.toFixed(6) });
      expected.delete(account.account);
    }
    for (const [account, amount] of expected) if (!amount.isZero()) mismatches.push({ account, difference: amount.negated().toFixed(6) });
    let providerBalances: unknown;
    try { providerBalances = await this.provider.balances(); }
    catch { providerBalances = { unavailable: true }; }
    const providerAccount = await this.db.collection('finance_accounts').findOne({ account: 'external:nowpayments' });
    const expectedProvider = new Decimal(providerAccount?.balance?.toString() ?? '0').negated();
    const currencies = Object.values(JSON.parse('{}')) as string[];
    let providerAmount = new Decimal(0);
    let providerUsable = false;
    if (providerBalances && typeof providerBalances === 'object' && !(providerBalances as any).unavailable) {
      for (const currency of currencies) {
        const balance = (providerBalances as any)[currency];
        if (balance?.amount !== undefined) { providerAmount = providerAmount.plus(String(balance.amount)); providerUsable = true; }
      }
    }
    const providerDifference = providerUsable ? providerAmount.minus(expectedProvider).toFixed(6) : null;
    const unresolved = await this.db.collection('finance_orders').countDocuments({ status: { $in: ['submitting', 'uncertain', 'verification_pending', 'processing'] } });
    await this.db.collection('finance_reconciliations').insertOne({ createdAt: new Date(),
      balanced: difference.isZero() && mismatches.length === 0, difference: difference.toFixed(6),
      accountMismatches: mismatches, providerBalances, providerDifference, unresolved });
    if (!difference.isZero() || mismatches.length) this.logger.error('event=ledger_imbalance');
    if (providerDifference !== null && !new Decimal(providerDifference).isZero() && unresolved === 0) this.logger.error('event=provider_balance_difference');

  }
}
