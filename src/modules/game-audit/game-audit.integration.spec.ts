import { createConnection, Connection, Types } from 'mongoose';
import { randomUUID } from 'crypto';
import { LedgerService } from '../payments/ledger.service';
import { totp } from '../payments/totp';
import { Room, RoomSchema } from '../room/schemas/room.schema';
import { User, UserSchema } from '../user/schemas/user.schema';
import { GameAuditService } from './game-audit.service';
import {
  GameAuditFinding, GameAuditFindingSchema, GameAuditReversal, GameAuditReversalSchema, GameAuditRun, GameAuditRunSchema,
} from './schemas/game-audit.schema';

const uri = process.env.P4C_TEST_MONGO_URI;
const suite = uri ? describe : describe.skip;
suite('game audit refunds with FINANCE_V2', () => {
  const seed = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
  const adminId = String(new Types.ObjectId());
  const winnerId = String(new Types.ObjectId());
  const loserId = String(new Types.ObjectId());
  let db: Connection;
  let ledger: LedgerService;
  let service: GameAuditService;
  let roomId: string;
  let clock = Date.now();
  // Each refund consumes a TOTP counter once; step 30 s per call so codes never repeat.
  const code = () => { clock += 30000; return totp(seed, clock); };

  beforeAll(async () => {
    if (!/^mongodb:\/\/127\.0\.0\.1:\d+\//.test(uri!)) throw new Error('Dedicated local test replica set required');
    db = await createConnection(uri!, { dbName: `p4c_audit_test_${randomUUID().replace(/-/g, '')}` }).asPromise();
    ledger = new LedgerService(db); await ledger.onModuleInit();
    await db.collection('finance_mfa_uses').createIndex({ adminId: 1 });
    const model = (name: string, schema: any): any => db.model(name, schema);
    service = new GameAuditService(
      db, model(Room.name, RoomSchema), model(User.name, UserSchema), model(GameAuditRun.name, GameAuditRunSchema),
      model(GameAuditFinding.name, GameAuditFindingSchema), model(GameAuditReversal.name, GameAuditReversalSchema),
      { invalidateHistory: () => undefined } as any, ledger,
      { get: (key: string) => key === 'FINANCE_ADMIN_TOTP_SECRETS' ? JSON.stringify({ [adminId]: seed }) : undefined } as any,
    );
  });
  beforeEach(async () => {
    process.env.FINANCE_V2_ENABLED = 'true';
    jest.spyOn(Date, 'now').mockImplementation(() => clock);
    for (const name of ['rooms', 'users', 'finance_journals', 'finance_accounts', 'gameauditreversals', 'gameauditfindings']) {
      await db.collection(name).deleteMany({});
    }
    roomId = String(new Types.ObjectId());
    await db.collection('users').insertMany([
      { _id: new Types.ObjectId(winnerId), username: 'winner', email: 'winner@test.local', balance: 25, total_won: 10, status: 'active' },
      { _id: new Types.ObjectId(loserId), username: 'loser', email: 'loser@test.local', balance: 5, status: 'active' },
    ]);
    await db.collection('rooms').insertOne({
      _id: new Types.ObjectId(roomId), game_id: new Types.ObjectId(), status: 'finished', source: 'casual', bet_amount: 10,
      winner: new Types.ObjectId(winnerId), winner_reason: 'forfeit', audit_evidence_version: 1,
      players: [{ playerId: new Types.ObjectId(winnerId), action_count: 4 }, { playerId: new Types.ObjectId(loserId), action_count: 0 }],
    });
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => { delete process.env.FINANCE_V2_ENABLED; await db.dropDatabase(); await db.close(); });

  const balance = async (account: string) =>
    (await db.collection('finance_accounts').findOne({ account }))?.balance?.toString();

  it('moves the stake from the winner back to the refunded player', async () => {
    const reversal = await service.reverse(roomId, loserId, adminId, 'Jugador sin acciones registradas', false, code());
    expect(reversal).toMatchObject({ amount: 10, winner_adjustment: 'balance_debited' });
    expect(await balance(`user:${loserId}:available`)).toBe('15.000000');
    expect(await balance(`user:${winnerId}:available`)).toBe('15.000000');
    expect((await db.collection('users').findOne({ _id: new Types.ObjectId(winnerId) }))!.total_won).toBe(0);
  });

  it('lets the house front the stake when the winner no longer holds it', async () => {
    await db.collection('users').updateOne({ _id: new Types.ObjectId(winnerId) }, { $set: { balance: 2 } });
    await db.startSession().then(async (session) => {
      await session.withTransaction(() => ledger.post('fund-house', [
        { account: 'external:opening', amount: '-50' }, { account: 'house:main', amount: '50' },
      ], session));
      await session.endSession();
    });
    const reversal = await service.reverse(roomId, loserId, adminId, 'Jugador sin acciones registradas', false, code());
    expect(reversal).toMatchObject({ winner_adjustment: 'debt_recorded', debt_created: 10 });
    expect(await balance('house:main')).toBe('40.000000');
    expect(await balance(`user:${loserId}:available`)).toBe('15.000000');
  });

  it('rejects the refund cleanly when neither the winner nor the house can cover it', async () => {
    await db.collection('users').updateOne({ _id: new Types.ObjectId(winnerId) }, { $set: { balance: 2 } });
    await expect(service.reverse(roomId, loserId, adminId, 'Jugador sin acciones registradas', false, code()))
      .rejects.toMatchObject({ message: 'ERROR_AUDIT_HOUSE_BALANCE_INSUFFICIENT' });
  });

  it('is idempotent once the refund exists', async () => {
    const first = await service.reverse(roomId, loserId, adminId, 'Jugador sin acciones registradas', false, code());
    const again = await service.reverse(roomId, loserId, adminId, 'Jugador sin acciones registradas', false, code());
    expect(String(again._id)).toBe(String(first._id));
    expect(await balance(`user:${loserId}:available`)).toBe('15.000000');
  });

  it('rejects a reused TOTP code without a server error', async () => {
    const reused = code();
    await service.reverse(roomId, loserId, adminId, 'Jugador sin acciones registradas', false, reused);
    await db.collection('gameauditreversals').deleteMany({});
    await expect(service.reverse(roomId, loserId, adminId, 'Jugador sin acciones registradas', false, reused))
      .rejects.toMatchObject({ message: 'INVALID_FINANCIAL_MFA' });
  });
});
