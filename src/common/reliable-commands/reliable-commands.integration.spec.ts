import { createConnection, Connection, Schema, Types } from 'mongoose';
import { randomUUID } from 'crypto';
import { configureReliableCommands, executeReliableAction, durableEmit, registerReliableNamespace, ReliableDisconnectAction } from './reliable-commands';
import { LedgerService } from '../../modules/payments/ledger.service';
import { gameFinancialUpdate, settleGameRoom } from '../../modules/payments/game-finance';
const uri = process.env.P4C_TEST_MONGO_URI;
const suite = uri ? describe : describe.skip;
suite('durable gameplay transactions', () => {
  let db: Connection;
  let roomId: string;
  let ledger: LedgerService;
  let games: any;
  const actor = '507f1f77bcf86cd799439011';
  const opponent = '507f1f77bcf86cd799439012';
  const delivered: any[] = [];
  const namespace: any = { name: '/test', to: (rooms: any) => ({ emit: (...args: any[]) => delivered.push({ rooms, args }) }), emit: (...args: any[]) => delivered.push(args) };
  beforeAll(async () => {
    if (!/^mongodb:\/\/127\.0\.0\.1:27184\//.test(uri!)) throw new Error('Dedicated test replica set required');
    db = await createConnection(uri!, { dbName: `p4c_game_test_${randomUUID().replace(/-/g, '')}` }).asPromise();
    configureReliableCommands(db); registerReliableNamespace(namespace);
    ledger = new LedgerService(db); await ledger.onModuleInit();
    games = db.model('TestGame', new Schema({ room_id: Types.ObjectId, revision: Number, board: [Number] }, { versionKey: false }));
    await db.collection('game_commands').createIndex({ roomId: 1, actorId: 1, commandId: 1 }, { unique: true });
  });
  beforeEach(async () => {
    process.env.FINANCE_V2_ENABLED = 'true';
    for (const name of ['rooms', 'users', 'finance_journals', 'finance_accounts', 'game_commands', 'game_outbox', 'testgames', 'finance_eligibility', 'games']) await db.collection(name).deleteMany({});
    roomId = String(new Types.ObjectId());
    const gameId = new Types.ObjectId();
    await db.collection('games').insertOne({ _id: gameId, socket_code: 'test' });
    await db.collection('rooms').insertOne({ game_id: gameId, _id: new Types.ObjectId(roomId), status: 'started', players: [{ playerId: new Types.ObjectId(actor) }, { playerId: new Types.ObjectId(opponent) }], bet_amount: 10, house_edge: 5 });
    await db.collection('users').insertMany([{ _id: new Types.ObjectId(actor), balance: 100, status: 'active' }, { _id: new Types.ObjectId(opponent), balance: 100, status: 'active' }]);
    await db.collection('finance_eligibility').insertMany([actor, opponent].map(userId => ({ userId, verifiedCountry: 'CO', observedCountry: 'CO', adultVerified: true, observedAt: new Date(), expiresAt: new Date(Date.now() + 3600000) })));
    await games.create({ room_id: roomId, revision: 0, board: [] });
    delivered.length = 0;
  });
  afterAll(async () => { delete process.env.FINANCE_V2_ENABLED; await db.dropDatabase(); await db.close(); });
  async function move(id: string, expected = 0, value = 3) {
    return executeReliableAction(roomId, actor, id, expected, 'move', { value }, '/test', async () => {
      const game = await games.findOne({ room_id: roomId });
      game.board.push(value); game.revision++; await game.save();
      durableEmit({ name: '/test' }, 'test', { success: true, data: { board: game.board } });
    });
  }
  it('stores state, command receipt and outbox atomically and replays the same receipt', async () => {
    const id = randomUUID();
    const first = await move(id); const second = await move(id);
    expect(first).toMatchObject({ status: 'accepted', version: 1 }); expect(second).toEqual(first);
    expect((await games.findOne({ room_id: roomId })).board).toEqual([3]);
    expect(await db.collection('game_commands').countDocuments()).toBe(1);
    expect(await db.collection('game_outbox').countDocuments({ published: false })).toBe(2);
    expect(delivered.every(e => e.args?.[0] === 'command_ack')).toBe(true);
  });
  it('prevents concurrent actions from overwriting the same revision', async () => {
    const result = await Promise.allSettled(Array.from({ length: 20 }, () => move(randomUUID())));
    expect(result.filter(r => r.status === 'fulfilled' && r.value.status === 'accepted')).toHaveLength(1);
    expect(result.filter(r => r.status === 'rejected')).toHaveLength(12);
    expect((await games.findOne({ room_id: roomId })).board).toEqual([3]);
  });
  it('rejects command ID reuse with a changed payload', async () => {
    const id = randomUUID(); await move(id);
    expect(await move(id, 0, 4)).toMatchObject({ status: 'rejected', reason: 'COMMAND_ID_CONFLICT' });
    expect((await games.findOne({ room_id: roomId })).board).toEqual([3]);
  });
  it('rolls back state and money if the process fails before commit', async () => {
    await expect(executeReliableAction(roomId, actor, randomUUID(), 0, 'move', {}, '/test', async () => {
      const game = await games.findOne({ room_id: roomId }); game.revision++; await game.save();
      await ledger.transaction(s => ledger.post('stake:test', [{ account: `user:${actor}:available`, amount: '-10' }, { account: `escrow:room:${roomId}`, amount: '10' }], s));
      throw new Error('simulated crash');
    })).rejects.toThrow('simulated crash');
    expect((await games.findOne({ room_id: roomId })).revision).toBe(0);
    expect(await db.collection('game_commands').countDocuments()).toBe(0);
    expect(await db.collection('game_outbox').countDocuments()).toBe(0);
    expect(await db.collection('finance_journals').countDocuments()).toBe(0);
    expect((await ledger.balances(actor)).available).toBe('100.000000');
  });
  it('rejects an actor outside the room without changing state', async () => {
    const result = await executeReliableAction(roomId, '507f1f77bcf86cd799439099', randomUUID(), 0, 'move', {}, '/test', async () => { throw new Error('must not execute'); });
    expect(result).toMatchObject({ status: 'rejected', reason: 'COMMAND_PLAYER_NOT_IN_ROOM' });
  });
  it('charges the exact persisted stake even when its compatibility display loses precision', async () => {
    const amount = '999999999999999999.999999';
    await db.collection('users').updateOne({ _id: new Types.ObjectId(actor) }, { $set: { balance: Types.Decimal128.fromString(amount) } });
    await db.collection('rooms').updateOne({ _id: new Types.ObjectId(roomId) }, { $set: { bet_amount: Number(amount), bet_amount_decimal: Types.Decimal128.fromString(amount) } });
    const users = db.model('PreciseTestUser', new Schema({}, { strict: false, collection: 'users' }));
    await gameFinancialUpdate(users, 'updateOne', [{ _id: actor }, { $inc: { balance: -Number(amount) } }], roomId);
    expect((await ledger.balances(actor)).available).toBe('0.000000');
    expect((await db.collection('finance_accounts').findOne({ account: `escrow:room:${roomId}` }))?.balance.toString()).toBe(amount);
  });
  it('recovers a finished room after a crash before award and pays only once', async () => {
    const users = db.model('TestUser', new Schema({}, { strict: false, collection: 'users' }));
    for (const id of [actor, opponent]) await gameFinancialUpdate(users, 'updateOne', [{ _id: id }, { $inc: { balance: -10 } }], roomId);
    await db.collection('rooms').updateOne({ _id: new Types.ObjectId(roomId) }, { $set: { status: 'finished', winner: new Types.ObjectId(actor) } });
    await Promise.all(Array.from({ length: 10 }, () => settleGameRoom(db, roomId)));
    expect((await ledger.balances(actor)).available).toBe('109.000000');
    expect((await ledger.balances(opponent)).available).toBe('90.000000');
    expect((await db.collection('finance_accounts').findOne({ account: 'house:main' }))?.balance.toString()).toBe('1.000000');
  });
  it('finishes multiple last-player disconnects without an empty active-room index collision', async () => {
    process.env.RELIABLE_COMMANDS_ENABLED = 'true';
    try {
      await db.collection('rooms').deleteMany({});
      await db.collection('rooms').createIndex({ 'players.playerId': 1 }, { unique: true, partialFilterExpression: { status: { $in: ['waiting', 'started'] } } });
      const ids = [new Types.ObjectId(), new Types.ObjectId()];
      await db.collection('rooms').insertMany(ids.map((id, index) => ({ _id: id, status: 'waiting', players: [{ playerId: new Types.ObjectId(index ? opponent : actor) }] })));
      const server: any = { ...namespace, to: (room: string) => ({ name: '/test', rooms: new Set([room]), emit: jest.fn() }), in: () => ({ fetchSockets: async () => [] }) };
      class Lifecycle {
        server = server;
        @ReliableDisconnectAction()
        async handleDisconnect(_client: any) { throw new Error('The unsafe empty-room legacy handler must not execute'); }
      }
      const gateway = new Lifecycle();
      await Promise.all(ids.map((id, index) => gateway.handleDisconnect({ id: `fixture-socket-${index}`, data: { room_id: String(id), player_id: index ? opponent : actor } })));
      expect(await db.collection('rooms').countDocuments({ status: 'finished' })).toBe(2);
      expect(await db.collection('game_disconnects').countDocuments({ completed: true })).toBe(2);
      expect(await db.collection('game_outbox').countDocuments({})).toBeGreaterThanOrEqual(2);
    } finally { delete process.env.RELIABLE_COMMANDS_ENABLED; }
  });
});
