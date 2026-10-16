import { createConnection, Connection, Schema, Types } from 'mongoose';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { LedgerService } from './ledger.service';
import { registerTournament, settleTournament, refundCancelledParticipant } from './tournament-finance';
import { gameFinancialUpdate } from './game-finance';
import { TournamentAdminService } from '../tournament/services/tournament-admin.service';
import { totp } from './totp';
const uri = process.env.P4C_TEST_MONGO_URI;
const suite = uri ? describe : describe.skip;
suite('tournament money and cancellation', () => {
  let db: Connection; let ledger: LedgerService; let tournaments: any; let users: any;
  let id: Types.ObjectId;
  const playerIds = [new Types.ObjectId(), new Types.ObjectId()];
  const adminId = '507f1f77bcf86cd799439099';
  const seed = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
  const savedFinance = process.env.FINANCE_V2_ENABLED;
  beforeAll(async () => {
    if (!/^mongodb:\/\/127\.0\.0\.1:27184\//.test(uri!)) throw new Error('Dedicated test replica set required');
    db = await createConnection(uri!, { dbName: `p4c_tournament_test_${randomUUID().replace(/-/g, '')}` }).asPromise();
    ledger = new LedgerService(db); await ledger.onModuleInit();
    tournaments = db.model('TournamentFixture', new Schema({ status: String, prizes_settled: Boolean, game_socket_code: String }, { strict: false, collection: 'tournaments' }));
    users = db.model('UserFixture', new Schema({}, { strict: false, collection: 'users' }));
    process.env.FINANCE_V2_ENABLED = 'true';
  });
  beforeEach(async () => {
    for (const collection of ['tournaments', 'tournamentparticipants', 'tournamenttransactions', 'finance_accounts', 'finance_journals', 'finance_requests', 'finance_eligibility', 'finance_admin_audit', 'finance_mfa_uses', 'rooms', 'game_outbox', 'users']) await db.collection(collection).deleteMany({});
    id = new Types.ObjectId();
    await db.collection('users').insertMany(playerIds.map((userId, index) => ({ _id: userId, balance: 100, status: 'active', username: `fixture-${index}` })));
    await db.collection('finance_eligibility').insertMany(playerIds.map(userId => ({ userId: String(userId), verifiedCountry: 'CO', observedCountry: 'CO', adultVerified: true, observedAt: new Date(), expiresAt: new Date(Date.now() + 3600000) })));
    await db.collection('tournaments').insertOne({ _id: id, game_socket_code: 'connect-four', status: 'open', buy_in: 10, buy_in_decimal: Types.Decimal128.fromString('10.000001'), registered_count: 0, max_players: 2, min_players: 2, group_count: 1, starts_at: new Date(Date.now() + 3600000), gross_prize_pool: 0, house_fee_percent: 10, first_place_percent: 70 });
  });
  afterAll(async () => {
    if (savedFinance === undefined) delete process.env.FINANCE_V2_ENABLED; else process.env.FINANCE_V2_ENABLED = savedFinance;
    await db.dropDatabase(); await db.close();
  });
  async function registerBoth() { await Promise.all(playerIds.map(userId => registerTournament(db, String(id), String(userId), randomUUID()))); }
  function admin() { return new TournamentAdminService(tournaments, {} as any, new ConfigService({ FINANCE_ADMIN_TOTP_SECRETS: JSON.stringify({ [adminId]: seed }) })); }
  const authorization = () => ({ adminId, code: totp(seed), key: randomUUID(), reason: 'Sandbox audited cancellation' });
  it('charges registration once and never charges an individual tournament match again', async () => {
    const key = randomUUID();
    await registerTournament(db, String(id), String(playerIds[0]), key);
    await registerTournament(db, String(id), String(playerIds[0]), key);
    await registerTournament(db, String(id), String(playerIds[1]), randomUUID());
    const roomId = new Types.ObjectId();
    await db.collection('rooms').insertOne({ _id: roomId, source: 'tournament', tournament_id: id, status: 'started', bet_amount: 0, players: playerIds.map(playerId => ({ playerId })) });
    for (const userId of playerIds) await gameFinancialUpdate(users, 'findOneAndUpdate', [{ _id: userId }, { $inc: { balance: 0 } }], String(roomId));
    expect((await ledger.balances(String(playerIds[0]))).available).toBe('89.999999');
    expect((await db.collection('finance_accounts').findOne({ account: `escrow:tournament:${id}` }))?.balance.toString()).toBe('20.000002');
    expect(await db.collection('finance_journals').countDocuments({ operationId: { $regex: '^room:stake:' } })).toBe(0);
  });
  it('pays exact prizes and house fees only once under repeated settlement', async () => {
    await registerBoth();
    await Promise.all(Array.from({ length: 10 }, () => settleTournament(db, String(id), String(playerIds[0]), String(playerIds[1]))));
    expect((await ledger.balances(String(playerIds[0]))).available).toBe('104.000000');
    expect((await ledger.balances(String(playerIds[1]))).available).toBe('94.000000');
    expect((await db.collection('finance_accounts').findOne({ account: 'house:main' }))?.balance.toString()).toBe('2.000000');
  });
  it('cancels with MFA, closes rooms durably and refunds each stake once', async () => {
    await registerBoth(); const roomId = new Types.ObjectId();
    await db.collection('rooms').insertOne({ _id: roomId, source: 'tournament', tournament_id: id, status: 'started', players: playerIds.map(playerId => ({ playerId })) });
    const proof = authorization();
    await admin().cancel(String(id), proof); await admin().cancel(String(id), proof);
    await Promise.all(playerIds.flatMap(userId => [refundCancelledParticipant(db, String(id), String(userId)), refundCancelledParticipant(db, String(id), String(userId))]));
    await settleTournament(db, String(id), String(playerIds[0]), String(playerIds[1]));
    for (const userId of playerIds) expect((await ledger.balances(String(userId))).available).toBe('100.000000');
    expect(await db.collection('finance_journals').countDocuments({ operationId: `tournament:settle:${id}` })).toBe(0);
    expect((await db.collection('rooms').findOne({ _id: roomId }))?.status).toBe('finished');
    expect(await db.collection('game_outbox').countDocuments({ roomId: String(roomId) })).toBe(1);
  });
  it('serializes cancellation against final settlement without paying and refunding together', async () => {
    await registerBoth();
    await Promise.allSettled([admin().cancel(String(id), authorization()), settleTournament(db, String(id), String(playerIds[0]), String(playerIds[1]))]);
    const final = await db.collection('tournaments').findOne({ _id: id });
    if (final?.status === 'cancelled') {
      for (const userId of playerIds) await refundCancelledParticipant(db, String(id), String(userId));
      expect(await db.collection('finance_journals').countDocuments({ operationId: `tournament:settle:${id}` })).toBe(0);
      for (const userId of playerIds) expect((await ledger.balances(String(userId))).available).toBe('100.000000');
    } else {
      expect(final?.prizes_settled).toBe(true);
      expect((await ledger.balances(String(playerIds[0]))).available).toBe('104.000000');
      expect((await ledger.balances(String(playerIds[1]))).available).toBe('94.000000');
    }
  });
});
