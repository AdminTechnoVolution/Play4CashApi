import { ConfigService } from '@nestjs/config';
import { Connection, createConnection, Types } from 'mongoose';
import { LedgerService } from './ledger.service';
import { PaymentsService } from './payments.service';
import { PaymentsWorker } from './payments.worker';
import { PaymentsPolicy } from './payments-policy.service';
import { bsonMoney } from './money';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PaymentsAdminController } from './payments-admin.controller';
import { NowPaymentsClient, NowPaymentsRejectedError } from './nowpayments.client';
import { totp } from './totp';
import { withdrawalAuthorization } from './withdrawal-authorization';
import { fingerprint } from './canonical';

// Run only against the dedicated ephemeral replica set. Never application .env data.
const uri = process.env.P4C_TEST_MONGO_URI;
const suite = uri ? describe : describe.skip;
suite('MongoDB financial transactions and restart recovery', () => {
  let db: Connection;
  let ledger: LedgerService;
  let payments: PaymentsService;
  let worker: PaymentsWorker;
  const userId = '507f1f77bcf86cd799439011';
  const otherId = '507f1f77bcf86cd799439012';
  const config = new ConfigService({ FINANCE_V2_ENABLED: 'true', PAYMENTS_WORKER: 'true', PAYMENTS_DEPOSITS_ENABLED: 'true',
    PAYMENTS_WITHDRAWALS_ENABLED: 'true', NOWPAYMENTS_BASE_URL: 'https://api-sandbox.nowpayments.io/v1',
    NOWPAYMENTS_IPN_URL: 'https://example.test/api/payments/ipn/nowpayments',
    NOWPAYMENTS_PAYOUT_TOTP_SECRET: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
    FINANCE_ADMIN_TOTP_SECRETS: '{"507f1f77bcf86cd799439012":"GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"}' });
  const provider: any = { claimSubmissionSlot: jest.fn(async () => true), deposit: jest.fn(), authenticate: jest.fn(async () => 'test-token'),
    balances: jest.fn(async () => ({ usdttrc20: { amount: '100000.000000' } })),
    payoutFee: jest.fn(async () => ({ fee: '1' })), createPayout: jest.fn(), verifyPayout: jest.fn(), payout: jest.fn(),
    merchantCoins: jest.fn(async () => ({ selectedCurrencies: ['usdttrc20'] })),
    minimum: jest.fn(async () => ({ min_amount: '1' })), createDeposit: jest.fn(),
    validateAddress: jest.fn(async () => ({})), verify: jest.fn(() => true) };
  const email: any = { sendWithdrawalVerification: jest.fn(async () => {}) };
  beforeAll(async () => {
    if (!/^mongodb:\/\/127\.0\.0\.1:27184\//.test(uri!)) throw new Error('Dedicated local test database required');
    db = await createConnection(uri!, { dbName: `p4c_finance_test_${randomUUID().replace(/-/g, '')}` }).asPromise();
    ledger = new LedgerService(db);
    payments = new PaymentsService(db, ledger, provider, new PaymentsPolicy(config, db), config, email);
    worker = new PaymentsWorker(db, config, provider, ledger, payments);
    await ledger.onModuleInit(); await payments.onModuleInit();
  });
  beforeEach(async () => {
    for (const name of ['finance_requests', 'finance_accounts', 'finance_journals', 'finance_orders', 'finance_quotes', 'finance_challenges', 'finance_eligibility', 'finance_ipn', 'finance_resolution_requests', 'finance_admin_audit', 'finance_mfa_uses', 'finance_return_requests', 'finance_provider_limits', 'users']) {
      await db.collection(name).deleteMany({});
    }
    jest.clearAllMocks();
    await db.collection('users').insertOne({ _id: new Types.ObjectId(userId), email: 'test@example.test', username: 'test', status: 'active' });
    await db.collection('finance_eligibility').insertOne({ userId, verifiedCountry: 'CO', observedCountry: 'CO', adultVerified: true, observedAt: new Date(), expiresAt: new Date(Date.now() + 3600000) });
  });
  afterAll(async () => { await db.dropDatabase(); await db.close(); });
  async function fund(amount: string) {
    await ledger.transaction(s => ledger.post('test:opening', [
      { account: 'external:opening', amount: `-${amount}` }, { account: `user:${userId}:available`, amount },
    ], s));
  }
  async function verificationOrder(amount: string) {
    const id = new Types.ObjectId();
    await db.collection('finance_orders').insertOne({ _id: id, userId, kind: 'withdrawal', key: randomUUID(), amount, net: amount, fee: '0.000000', network: 'TRC20', currency: 'usdttrc20', address: 'fixture-address', status: 'pending_verify' });
    await db.collection('finance_challenges').insertOne({ orderId: String(id), userId, hash: await bcrypt.hash('123456', 4), attempts: 0, expiresAt: new Date(Date.now() + 60000) });
    return String(id);
  }
  async function sealWithdrawal(order: any) {
    const authorization = withdrawalAuthorization(order);
    await db.collection('finance_requests').insertOne({ _id: `withdrawal:verify:fixture:${order._id}` as any,
      authorization, authorizationHash: fingerprint(authorization), createdAt: new Date() });
  }
  it('deduplicates administrative adjustments and rejects reuse of the MFA counter', async () => {
    await fund('100');
    const admin = new PaymentsAdminController(db, config, ledger);
    const actor: any = { id: otherId };
    const body: any = { userId, amount: '10', direction: 'debit', reason: 'Sandbox audited correction', code: totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ') };
    await admin.adjust(actor, body, 'test-adjustment-id-0001');
    await admin.adjust(actor, body, 'test-adjustment-id-0001');
    await expect(admin.adjust(actor, { ...body, amount: '11' }, 'test-adjustment-id-0001')).rejects.toThrow('IDEMPOTENCY_CONFLICT');
    await expect(admin.adjust(actor, body, 'test-adjustment-id-0002')).rejects.toMatchObject({ code: 11000 });
    expect((await ledger.balances(userId)).available).toBe('90.000000');
    expect(await db.collection('finance_admin_audit').countDocuments({})).toBe(1);
  });
  it('shares provider submission limits across concurrent workers', async () => {
    const client = new NowPaymentsClient(config, db);
    const attempts = await Promise.all(Array.from({ length: 10 }, () => client.claimSubmissionSlot('deposit')));
    expect(attempts.filter(Boolean)).toHaveLength(1);
  });
  it('discovers USDT networks without custom configuration and excludes unenabled coins', async () => {
    const defaults = new ConfigService({});
    const policy = new PaymentsPolicy(defaults, db);
    const service = new PaymentsService(db, ledger, provider, policy, defaults, email);
    provider.merchantCoins.mockResolvedValueOnce({ selectedCurrencies: ['BTC', 'USDTTRC20'] });
    expect(await service.networks()).toEqual([{ network: 'TRC20', currency: 'usdttrc20', asset: 'USDT' }]);
  });
  it('stores the provider net quote on submission without letting a missing quote fail the deposit', async () => {
    const quoted = { _id: new Types.ObjectId(), userId, kind: 'deposit', key: randomUUID(), amount: '100.000000', currency: 'usdttrc20', status: 'created' };
    const unquoted = { ...quoted, _id: new Types.ObjectId(), key: randomUUID() };
    await db.collection('finance_orders').insertMany([quoted, unquoted]);
    const payment = { pay_address: 'fixture-address', pay_currency: 'usdttrc20', pay_amount: '100' };
    provider.createDeposit.mockResolvedValueOnce({ ...payment, payment_id: 'quoted-1', amount_received: '93.6149871' })
      .mockResolvedValueOnce({ ...payment, payment_id: 'unquoted-1' });
    await worker.submitDeposit(quoted);
    await worker.submitDeposit(unquoted);
    expect(await payments.get(userId, String(quoted._id))).toMatchObject({ status: 'waiting', expectedCredit: '93.614987' });
    const plain = await db.collection('finance_orders').findOne({ _id: unquoted._id });
    expect(plain).toMatchObject({ status: 'waiting' });
    expect(plain).not.toHaveProperty('expectedCredit');
  });
  it('estimates deposit fees per network from recent provider quotes', async () => {
    const quote = (network: string, amount: string, expectedCredit: string, daysAgo = 0) => ({ _id: new Types.ObjectId(), userId, kind: 'deposit',
      key: randomUUID(), network, amount, expectedCredit, status: 'waiting', createdAt: new Date(Date.now() - daysAgo * 86400000) });
    await db.collection('finance_orders').insertMany([
      // TRC20 fixed part: 100 - 93.989 - 0.5 = 5.511, 1000 - 989.4 - 5 = 5.6, 50 - 44.3 - 0.25 = 5.45 → median 5.511
      quote('TRC20', '100.000000', '93.989000'), quote('TRC20', '1000.000000', '989.400000'), quote('TRC20', '50.000000', '44.300000'),
      quote('BEP20', '100.000000', '99.000000'),
      quote('SOLANA', '100.000000', '10.000000', 31),
    ]);
    provider.merchantCoins.mockResolvedValueOnce({ selectedCurrencies: ['USDTTRC20', 'USDTBSC', 'USDTSOL'] });
    expect(await payments.networkOptions()).toEqual([
      { network: 'TRC20', currency: 'usdttrc20', asset: 'USDT', withdrawable: true, depositFee: { fixed: '5.511000', rate: '0.005' } },
      { network: 'BEP20', currency: 'usdtbsc', asset: 'USDT', withdrawable: false, depositFee: { fixed: '0.500000', rate: '0.005' } },
      { network: 'SOLANA', currency: 'usdtsol', asset: 'USDT', withdrawable: false },
    ]);
  });
  it('quotes withdrawals only on TRC20, before contacting the provider', async () => {
    await expect(payments.quote(userId, 'BEP20', '0xFixtureAddress000000000000000000000000', '10')).rejects.toThrow('WITHDRAWAL_NETWORK_UNAVAILABLE');
    expect(provider.validateAddress).not.toHaveBeenCalled();
    expect(provider.payoutFee).not.toHaveBeenCalled();
    expect(await payments.quote(userId, 'TRC20', 'TFixtureAddress0000000000000000000', '10')).toMatchObject({ network: 'TRC20', net: '10.000000' });
  });
  it('records a provider-rejected deposit without credit or resend', async () => {
    const order = { _id: new Types.ObjectId(), userId, kind: 'deposit', key: randomUUID(), amount: '10.000000', currency: 'usdttrc20', status: 'created' };
    await db.collection('finance_orders').insertOne(order);
    provider.createDeposit.mockRejectedValueOnce(new NowPaymentsRejectedError(403));
    await worker.submitDeposit(order);
    await worker.submitDeposit(order);
    expect(provider.createDeposit).toHaveBeenCalledTimes(1);
    expect((await db.collection('finance_orders').findOne({ _id: order._id }))?.status).toBe('rejected');
    expect(await db.collection('finance_journals').countDocuments({})).toBe(0);
  });
  it('accepts a sandbox deposit without local country or KYC provisioning', async () => {
    await db.collection('finance_eligibility').deleteMany({});
    const order = await payments.deposit(userId, 'global-deposit-key-0001', 'TRC20', '10');
    expect(order.status).toBe('created');
    await db.collection('finance_eligibility').insertOne({ userId, verifiedCountry: 'XX', observedCountry: 'ZZ' });
    expect((await payments.deposit(userId, 'global-deposit-key-0002', 'TRC20', '10')).status).toBe('created');
  });
  it('releases a provider-rejected payout reservation once, with no resubmission', async () => {
    await fund('100');
    const order: any = { _id: new Types.ObjectId(), userId, kind: 'withdrawal', key: randomUUID(), amount: '11.000000',
      net: '10.000000', fee: '1.000000', currency: 'usdttrc20', address: 'test-address', status: 'reserved' };
    await db.collection('finance_orders').insertOne(order);
    await ledger.transaction(session => ledger.post(`withdrawal:reserve:${order._id}`, [
      { account: `user:${userId}:available`, amount: '-11' }, { account: `user:${userId}:withdrawals`, amount: '11' },
    ], session));
    await sealWithdrawal(order);
    provider.createPayout.mockRejectedValueOnce(new NowPaymentsRejectedError(403));
    await worker.submitWithdrawal(order);
    await worker.submitWithdrawal(order);
    expect(provider.createPayout).toHaveBeenCalledTimes(1);
    expect(await ledger.balances(userId)).toMatchObject({ available: '100.000000', reserved: '0.000000' });
    expect((await db.collection('finance_orders').findOne({ _id: order._id }))?.status).toBe('rejected');
    expect(await db.collection('finance_journals').countDocuments({ operationId: `withdrawal:provider-reject:${order._id}` })).toBe(1);
  });
  it('retains the reservation and does not send when provider liquidity is insufficient', async () => {
    await fund('100');
    const order: any = { _id: new Types.ObjectId(), userId, kind: 'withdrawal', key: randomUUID(), amount: '11.000000',
      net: '10.000000', fee: '1.000000', currency: 'usdttrc20', address: 'test-address', status: 'reserved' };
    await db.collection('finance_orders').insertOne(order);
    await ledger.transaction(session => ledger.post(`withdrawal:reserve:${order._id}`, [
      { account: `user:${userId}:available`, amount: '-11' }, { account: `user:${userId}:withdrawals`, amount: '11' },
    ], session));
    provider.balances.mockResolvedValueOnce({ usdttrc20: { amount: '10.000000' } });
    await sealWithdrawal(order);
    await worker.submitWithdrawal(order);
    expect(provider.createPayout).not.toHaveBeenCalled();
    expect(await ledger.balances(userId)).toMatchObject({ available: '89.000000', reserved: '11.000000' });
    expect((await db.collection('finance_orders').findOne({ _id: order._id }))?.liquidityRetryAt).toBeInstanceOf(Date);
  });
  it('allows a restricted-country return case without creating a payout or changing funds', async () => {
    await db.collection('finance_eligibility').updateOne({ userId }, { $set: { verifiedCountry: 'XX', observedCountry: 'XX' } });
    const key = 'restricted-return-id-0001';
    const first = await payments.requestFundReturn(userId, key, 'Country no longer enabled');
    expect(await payments.requestFundReturn(userId, key, 'Country no longer enabled')).toEqual(first);
    expect(await db.collection('finance_return_requests').countDocuments({})).toBe(1);
    expect(await db.collection('finance_journals').countDocuments({})).toBe(0);
    expect(provider.createPayout).not.toHaveBeenCalled();
  });
  it('does not submit an order merely because it claims to be reserved', async () => {
    const order: any = { _id: new Types.ObjectId(), userId, kind: 'withdrawal', key: randomUUID(), amount: '11.000000', fee: '1.000000', net: '10.000000',
      network: 'TRC20', currency: 'usdttrc20', address: 'fixture-address', status: 'reserved' };
    await db.collection('finance_orders').insertOne(order);
    await worker.submitWithdrawal(order);
    expect(provider.authenticate).not.toHaveBeenCalled();
    expect(provider.createPayout).not.toHaveBeenCalled();
    expect((await db.collection('finance_orders').findOne({ _id: order._id }))?.reviewReason).toBe('authorization_not_proven');
  });
  it('blocks a destination changed after the player authorized and reserved the withdrawal', async () => {
    await fund('100');
    const id = await verificationOrder('10.000000');
    await payments.verifyWithdrawal(userId, id, '123456', randomUUID());
    await db.collection('finance_orders').updateOne({ _id: new Types.ObjectId(id) }, { $set: { address: 'changed-destination' } });
    const changed = await db.collection('finance_orders').findOne({ _id: new Types.ObjectId(id) });
    await worker.submitWithdrawal(changed);
    expect(provider.createPayout).not.toHaveBeenCalled();
    expect(await ledger.balances(userId)).toMatchObject({ available: '90.000000', reserved: '10.000000' });
    expect((await db.collection('finance_orders').findOne({ _id: new Types.ObjectId(id) }))?.status).toBe('review');
  });
  it('consumes concurrent OTP verifications once and creates one reservation', async () => {
    await fund('100');
    const id = await verificationOrder('10.000000');
    const attempts = await Promise.allSettled([payments.verifyWithdrawal(userId, id, '123456', randomUUID()), payments.verifyWithdrawal(userId, id, '123456', randomUUID())]);
    expect(attempts.filter(a => a.status === 'fulfilled')).toHaveLength(1);
    expect(await db.collection('finance_journals').countDocuments({ operationId: `withdrawal:reserve:${id}` })).toBe(1);
    expect(await ledger.balances(userId)).toMatchObject({ available: '90.000000', reserved: '10.000000' });
  });
  it('recovers the original verification result after a lost response without reserving again', async () => {
    await fund('100');
    const id = await verificationOrder('10.000000');
    const key = randomUUID();
    const first = await payments.verifyWithdrawal(userId, id, '123456', key);
    config.set('PAYMENTS_WITHDRAWALS_ENABLED', 'false');
    try {
      expect(await payments.verifyWithdrawal(userId, id, '123456', key)).toEqual(first);
      expect(await db.collection('finance_journals').countDocuments({ operationId: `withdrawal:reserve:${id}` })).toBe(1);
      await expect(payments.verifyWithdrawal(userId, String(new Types.ObjectId()), '123456', key)).rejects.toThrow('IDEMPOTENCY_CONFLICT');
    } finally { config.set('PAYMENTS_WITHDRAWALS_ENABLED', 'true'); }
  });
  it('replays an administrative rejection after a lost response without releasing the reserve twice', async () => {
    await fund('100');
    const id = new Types.ObjectId();
    await ledger.transaction(session => ledger.post(`withdrawal:reserve:${id}`, [
      { account: `user:${userId}:available`, amount: '-10' }, { account: `user:${userId}:withdrawals`, amount: '10' },
    ], session));
    const order = { _id: id, userId, kind: 'withdrawal', key: randomUUID(), amount: '10.000000', net: '10.000000', fee: '0.000000', currency: 'usdttrc20', network: 'TRC20', address: 'fixture-address', status: 'review' };
    await db.collection('finance_orders').insertOne(order);
    await sealWithdrawal(order);
    const admin = new PaymentsAdminController(db, config, ledger);
    const actor: any = { id: otherId };
    const body: any = { decision: 'reject', reason: 'Sandbox review rejection', code: totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ') };
    const key = randomUUID();
    const first = await admin.decide(actor, { id: String(id) }, body, key);
    expect(await admin.decide(actor, { id: String(id) }, body, key)).toEqual(first);
    await expect(admin.decide(actor, { id: String(id) }, { ...body, decision: 'approve' }, key)).rejects.toThrow('IDEMPOTENCY_CONFLICT');
    expect(await ledger.balances(userId)).toMatchObject({ available: '100.000000', reserved: '0.000000' });
    expect(await db.collection('finance_journals').countDocuments({ operationId: `withdrawal:reject:${id}` })).toBe(1);
  });
  it('serializes rolling review limits across concurrent reservations', async () => {
    await fund('2000');
    await db.collection('finance_orders').insertOne({ userId, kind: 'withdrawal', key: 'prior-confirmed', amount: '100.000000', status: 'confirmed', reservedAt: new Date() });
    const ids = await Promise.all([verificationOrder('500.000000'), verificationOrder('500.000000')]);
    await Promise.all(ids.map(id => payments.verifyWithdrawal(userId, id, '123456', randomUUID())));
    const orders = await db.collection('finance_orders').find({ _id: { $in: ids.map(id => new Types.ObjectId(id)) } }).toArray();
    expect(orders.map(o => o.status).sort()).toEqual(['reserved', 'review']);
    expect(await ledger.balances(userId)).toMatchObject({ available: '1000.000000', reserved: '1000.000000' });
  });
  it('counts old active reservations and recently paid withdrawals using the payout date', async () => {
    await fund('2000');
    const old = new Date(Date.now() - 2 * 86400000);
    await db.collection('finance_orders').insertMany([
      { userId, kind: 'withdrawal', key: 'old-still-active', amount: '400.000000', status: 'uncertain', reservedAt: old },
      { userId, kind: 'withdrawal', key: 'old-reserved-paid-today', amount: '400.000000', status: 'confirmed', reservedAt: old, confirmedAt: new Date() },
    ]);
    const id = await verificationOrder('300.000000');
    const result = await payments.verifyWithdrawal(userId, id, '123456', randomUUID());
    expect(result.status).toBe('review');
  });
  it('refuses to bind an uncertain payout using only matching address and amount', async () => {
    const id = new Types.ObjectId();
    await db.collection('finance_orders').insertOne({ _id: id, userId, kind: 'withdrawal', key: 'unbound-test', status: 'uncertain', currency: 'usdttrc20', address: 'test-address', net: '10.000000' });
    const request: any = { _id: new Types.ObjectId(), orderId: String(id), providerId: 'foreign-payout', adminId: otherId, reason: 'Sandbox investigation', status: 'pending' };
    await db.collection('finance_resolution_requests').insertOne(request);
    provider.payout.mockResolvedValue({ id: 'foreign-payout', currency: 'usdttrc20', address: 'test-address', amount: '10', unique_external_id: 'other-order' });
    await worker.resolveUncertain(request);
    expect((await db.collection('finance_orders').findOne({ _id: id }))?.providerId).toBeUndefined();
    expect((await db.collection('finance_resolution_requests').findOne({ _id: request._id }))?.status).toBe('rejected');
    expect(await db.collection('finance_journals').countDocuments({})).toBe(0);
  });
  it('binds a proven provider operation without sending or moving funds again', async () => {
    const id = new Types.ObjectId();
    await db.collection('finance_orders').insertOne({ _id: id, userId, kind: 'withdrawal', key: 'proven-test', status: 'uncertain', currency: 'usdttrc20', address: 'test-address', net: '10.000000' });
    const request: any = { _id: new Types.ObjectId(), orderId: String(id), providerId: 'proven-payout', adminId: otherId, reason: 'Sandbox investigation', status: 'pending' };
    await db.collection('finance_resolution_requests').insertOne(request);
    provider.payout.mockResolvedValue({ id: 'proven-payout', currency: 'usdttrc20', address: 'test-address', amount: '10', unique_external_id: String(id) });
    await Promise.all([worker.resolveUncertain(request), worker.resolveUncertain(request)]);
    expect((await db.collection('finance_orders').findOne({ _id: id }))?.providerId).toBe('proven-payout');
    expect(await db.collection('finance_admin_audit').countDocuments({ orderId: String(id) })).toBe(1);
    expect(provider.createPayout).not.toHaveBeenCalled();
    expect(await db.collection('finance_journals').countDocuments({})).toBe(0);
  });
  it('rolls back the journal and both accounts when interrupted before commit', async () => {
    await expect(ledger.transaction(async s => {
      await ledger.post('interrupted', [{ account: 'external:opening', amount: '-10' }, { account: `user:${userId}:available`, amount: '10' }], s);
      throw new Error('simulated crash');
    })).rejects.toThrow('simulated crash');
    expect(await db.collection('finance_journals').countDocuments()).toBe(0);
    expect(await ledger.balances(userId)).toMatchObject({ available: '0.000000' });
  });
  it('replays an operation and rejects a changed payload without changing money', async () => {
    await fund('100'); await fund('100');
    await expect(fund('101')).rejects.toThrow('IDEMPOTENCY_CONFLICT');
    expect(await db.collection('finance_journals').countDocuments()).toBe(1);
    expect((await ledger.balances(userId)).available).toBe('100.000000');
  });
  it('credits duplicated concurrent finished notifications once after a worker restart', async () => {
    const order = { _id: new Types.ObjectId(), userId, kind: 'deposit', key: 'deposit-test-key', hash: 'test',
      network: 'TRC20', currency: 'usdttrc20', amount: '10.000000', providerId: '123', status: 'waiting' };
    await db.collection('finance_orders').insertOne(order);
    provider.deposit.mockResolvedValue({ payment_id: '123', order_id: String(order._id), pay_currency: 'usdttrc20',
      outcome_currency: 'usdttrc20', payment_status: 'finished', outcome_amount: '9.8', actually_paid: '10', pay_amount: '10' });
    await Promise.all(Array.from({ length: 10 }, () => worker.reconcileDeposit(order, '123')));
    const restarted = new PaymentsWorker(db, config, provider, ledger, payments);
    await restarted.reconcileDeposit(order, '123');
    expect((await ledger.balances(userId)).available).toBe('9.800000');
    expect(await db.collection('finance_journals').countDocuments()).toBe(1);
  });
  it('credits a USDT deposit that NOWPayments settles into another USDT network', async () => {
    const order = { _id: new Types.ObjectId(), userId, kind: 'deposit', key: 'cross-network-key', hash: 'test',
      network: 'BEP20', currency: 'usdtbsc', amount: '100.000000', providerId: '456', status: 'waiting' };
    await db.collection('finance_orders').insertOne(order);
    provider.deposit.mockResolvedValue({ payment_id: '456', order_id: String(order._id), pay_currency: 'usdtbsc',
      outcome_currency: 'usdttrc20', payment_status: 'finished', outcome_amount: '99.150086', actually_paid: '0', pay_amount: '100' });
    await worker.reconcileDeposit(order, '456');
    expect((await ledger.balances(userId)).available).toBe('99.150086');
    expect(await db.collection('finance_orders').findOne({ _id: order._id })).toMatchObject({ status: 'confirmed', settledCurrency: 'usdttrc20' });
  });
  it('never credits a settlement outside USDT', async () => {
    const order = { _id: new Types.ObjectId(), userId, kind: 'deposit', key: 'non-usdt-settlement', hash: 'test',
      network: 'TRC20', currency: 'usdttrc20', amount: '10.000000', providerId: '789', status: 'waiting' };
    await db.collection('finance_orders').insertOne(order);
    provider.deposit.mockResolvedValue({ payment_id: '789', order_id: String(order._id), pay_currency: 'usdttrc20',
      outcome_currency: 'btc', payment_status: 'finished', outcome_amount: '0.0001', actually_paid: '10', pay_amount: '10' });
    await expect(worker.reconcileDeposit(order, '789')).rejects.toThrow('SETTLEMENT_CURRENCY_MISMATCH');
    expect(await db.collection('finance_journals').countDocuments()).toBe(0);
    expect((await db.collection('finance_orders').findOne({ _id: order._id }))?.status).toBe('waiting');
  });
  it('rejects a deposit in the wrong network/currency', async () => {
    provider.deposit.mockResolvedValue({ payment_id: '123', order_id: 'x', pay_currency: 'btc' });
    await expect(worker.reconcileDeposit({ _id: 'x', currency: 'usdttrc20' }, '123')).rejects.toThrow('MISMATCH');
    expect(await db.collection('finance_journals').countDocuments()).toBe(0);
  });
  it('keeps a withdrawal reserved after a provider creation timeout and never re-sends', async () => {
    await fund('100');
    const order: any = { _id: new Types.ObjectId(), userId, kind: 'withdrawal', key: 'withdraw-test-key', amount: '11.000000',
      fee: '1.000000', net: '10.000000', network: 'TRC20', currency: 'usdttrc20', address: 'test-wallet-address', status: 'reserved' };
    await db.collection('finance_orders').insertOne(order);
    await ledger.transaction(s => ledger.post(`withdrawal:reserve:${order._id}`, [
      { account: `user:${userId}:available`, amount: '-11' }, { account: `user:${userId}:withdrawals`, amount: '11' },
    ], s));
    await sealWithdrawal(order);
    provider.createPayout.mockRejectedValue(new Error('timeout after provider accepted'));
    await worker.submitWithdrawal(order); await worker.submitWithdrawal(order);
    expect(provider.createPayout).toHaveBeenCalledTimes(1);
    expect((await ledger.balances(userId)).reserved).toBe('11.000000');
    expect((await db.collection('finance_orders').findOne({ _id: order._id }))?.status).toBe('uncertain');
  });
  it('releases a definitively rejected payout exactly once', async () => {
    await fund('100');
    const order: any = { _id: new Types.ObjectId(), userId, kind: 'withdrawal', key: 'withdraw-reject-key', amount: '11.000000',
      fee: '1.000000', net: '10.000000', currency: 'usdttrc20', address: 'test-wallet-address', status: 'processing', providerId: 'payout-1' };
    await db.collection('finance_orders').insertOne(order);
    await ledger.transaction(s => ledger.post(`withdrawal:reserve:${order._id}`, [
      { account: `user:${userId}:available`, amount: '-11' }, { account: `user:${userId}:withdrawals`, amount: '11' },
    ], s));
    await sealWithdrawal(order);
    provider.payout.mockResolvedValue({ id: 'payout-1', currency: 'usdttrc20', address: order.address, amount: '10', status: 'REJECTED' });
    await Promise.all(Array.from({ length: 10 }, () => worker.reconcileWithdrawal(order)));
    expect((await ledger.balances(userId)).available).toBe('100.000000');
    expect((await ledger.balances(userId)).reserved).toBe('0.000000');
  });
  it.each(['timeout', 'rejected'])('retains payout IDs when verification returns %s instead of refunding an accepted batch', async failure => {
    await fund('100');
    const order: any = { _id: new Types.ObjectId(), userId, kind: 'withdrawal', key: 'verify-failed-key',
      amount: '11.000000', fee: '1.000000', net: '10.000000', currency: 'usdttrc20', address: 'test-wallet-address', status: 'reserved' };
    await db.collection('finance_orders').insertOne(order);
    await ledger.transaction(session => ledger.post(`withdrawal:reserve:${order._id}`, [
      { account: `user:${userId}:available`, amount: '-11' }, { account: `user:${userId}:withdrawals`, amount: '11' },
    ], session));
    await sealWithdrawal(order);
    provider.createPayout.mockResolvedValue({ id: 'batch-1', withdrawals: [{ id: 'payout-1' }] });
    provider.verifyPayout.mockRejectedValue(failure === 'rejected' ? new NowPaymentsRejectedError(403) : new Error('2FA temporarily unavailable'));
    await worker.submitWithdrawal(order);
    const saved = await db.collection('finance_orders').findOne({ _id: order._id });
    expect(saved).toMatchObject({ status: 'verification_pending', providerId: 'payout-1', batchId: 'batch-1' });
    expect(await ledger.balances(userId)).toMatchObject({ available: '89.000000', reserved: '11.000000' });
    expect(provider.createPayout).toHaveBeenCalledTimes(1);
  });
  it('prevents two concurrent reservations from overspending one balance', async () => {
    await fund('10');
    const outcomes = await Promise.allSettled(['a', 'b'].map(id => ledger.transaction(s => ledger.post(`reserve:${id}`, [
      { account: `user:${userId}:available`, amount: '-7' }, { account: `user:${userId}:withdrawals`, amount: '7' },
    ], s))));
    expect(outcomes.filter(o => o.status === 'fulfilled')).toHaveLength(1);
    expect((await ledger.balances(userId)).available).toBe('3.000000');
  });
  it('does not expose another user payment', async () => {
    const id = new Types.ObjectId();
    await db.collection('finance_orders').insertOne({ _id: id, userId: otherId, kind: 'deposit', key: 'private-key' });
    await expect(payments.get(userId, String(id))).rejects.toThrow('PAYMENT_NOT_FOUND');
  });
});
