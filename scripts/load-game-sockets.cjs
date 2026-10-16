// Local, disposable test fixtures only. No provider requests. Keep all players connected across rounds.
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { createClient } = require('redis');
const { io } = require('../../Play4CashGateway/node_modules/socket.io-client');
const { randomUUID } = require('crypto');
const { performance } = require('perf_hooks');
const players = Number(process.env.P4C_LOAD_PLAYERS || 100);
const durationSeconds = Number(process.env.P4C_LOAD_SECONDS || 60);
const concurrency = Number(process.env.P4C_LOAD_CONCURRENCY || 25);
if (!Number.isInteger(players) || players < 2 || players > 5000 || players % 2 || !Number.isInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > 3600 || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 100) throw new Error('Invalid bounded load parameters');
const throughGateway = process.env.P4C_TEST_GATEWAY === 'true';
const sockets = []; const latencies = []; let accepted = 0; let rounds = 0;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
function listen(socket, event, predicate, timeout = 60000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(event, handler); reject(new Error(`Timeout: ${event}`)); }, timeout);
    const handler = value => { if (predicate(value)) { clearTimeout(timer); socket.off(event, handler); resolve(value); } };
    socket.on(event, handler);
  });
}
async function pool(items, work) {
  let index = 0; let failure;
  await Promise.allSettled(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (!failure && index < items.length) { const item = items[index++]; try { await work(item); } catch (error) { failure = error; } }
  }));
  if (failure) throw failure;
}
async function main() {
  const db = await mongoose.createConnection('mongodb://127.0.0.1:27184/p4c_game_e2e?replicaSet=p4c-test').asPromise();
  const redis = createClient({ url: 'redis://127.0.0.1:6388' }); await redis.connect();
  const run = randomUUID(); const tokens = []; let geoTimer;
  try {
    const catalogue = await db.collection('games').findOne({ socket_code: 'connect-four' }); assert(catalogue, 'Missing catalogue');
    await db.collection('games').updateOne({ _id: catalogue._id }, { $set: { turn_timer_seconds: 600 } });
    const ids = Array.from({ length: players }, () => new mongoose.Types.ObjectId());
    // Seed an already opened test ledger so the load measures gameplay rather than cold fixture import.
    const { fingerprint } = require('../dist/modules/payments/canonical');
    const initial = mongoose.Types.Decimal128.fromString('100000.000000');
    const session = await db.startSession();
    try { await session.withTransaction(async () => {
      await db.collection('users').insertMany(ids.map((id, i) => ({ _id: id, email: `${run}-${i}@example.test`, username: `load-${run}-${i}`, balance: initial, finance_v2_initialized: true, status: 'active' })), { session });
      await db.collection('finance_accounts').insertMany(ids.map(id => ({ account: `user:${id}:available`, balance: initial, updatedAt: new Date() })), { session });
      await db.collection('finance_journals').insertMany(ids.map(id => {
        const postings = [{ account: 'external:opening', amount: '-100000.000000' }, { account: `user:${id}:available`, amount: '100000.000000' }];
        return { operationId: `opening:user:${id}`, hash: fingerprint(postings), asset: 'USDT', createdAt: new Date(), postings: postings.map(p => ({ account: p.account, amount: mongoose.Types.Decimal128.fromString(p.amount) })) };
      }), { session });
      await db.collection('finance_accounts').updateOne({ account: 'external:opening' }, { $inc: { balance: mongoose.Types.Decimal128.fromString(String(-players * 100000)) }, $set: { updatedAt: new Date() } }, { upsert: true, session });
    }); } finally { await session.endSession(); }
    await db.collection('finance_eligibility').insertMany(ids.map(id => ({ userId: String(id), verifiedCountry: 'CO', observedCountry: 'CO', adultVerified: true, observedAt: new Date(), expiresAt: new Date(Date.now() + 7200000) })));
    geoTimer = setInterval(() => { void db.collection('finance_eligibility').updateMany({ userId: { $in: ids.map(String) } }, { $set: { observedAt: new Date() } }).catch(() => {}); }, 60000);
    await pool(ids.map((id, index) => ({ id, index })), async ({ id, index }) => {
      const token = jwt.sign({ id: String(id), email: `${run}-${index}@example.test`, typ: 'access', actor_type: 'player', jti: randomUUID() }, 'p4c-e2e-test-only-secret-key-2026', { issuer: 'play4cash-api', audience: 'play4cash-clients', expiresIn: '2h' });
      tokens.push(token); await redis.set(`accessTokens:${token}`, '1', { EX: 7200 });
      const socket = io(`http://127.0.0.1:${(throughGateway ? 3186 : 3184) + index % 2}/connect-four`, { autoConnect: false, auth: { token, commandProtocol: '1' }, transports: ['websocket'], reconnection: true });
      sockets[index] = socket;
      const connected = listen(socket, 'connect', () => true); socket.connect(); await connected;
    });
    assert(sockets.every(s => s.connected), 'Some players were not connected');
    console.log(JSON.stringify({ phase: 'connected', run, players }));
    const started = performance.now();
    do {
      await db.collection('finance_eligibility').updateMany({ userId: { $in: ids.map(String) } }, { $set: { observedAt: new Date() } });
      const rooms = Array.from({ length: players / 2 }, (_, index) => ({ _id: new mongoose.Types.ObjectId(), code: `${run}:${rounds}:${index}`, public: false, player_limit: 2, game_id: catalogue._id, bet_amount: 10, house_edge: 5,
        players: ids.slice(index * 2, index * 2 + 2).map(playerId => ({ playerId, ready: true, moves: [], action_count: 0 })), spectators: [], status: 'started', source: 'casual', created_at: new Date(), index }));
      await db.collection('rooms').insertMany(rooms.map(({ index, ...room }) => room));
      await pool(rooms, async room => {
        const clients = sockets.slice(room.index * 2, room.index * 2 + 2); const roomId = String(room._id);
        const initial = listen(clients[0], 'connect-four', p => p.data?.gameStarted && p.data?.board && p.data?.roomId === roomId);
        clients.forEach(s => s.emit('join', { room_id: roomId }));
        const first = await initial; let version = first.data.stateVersion;
        const game = await db.collection('connectfourgames').findOne({ room_id: room._id }); assert(game, 'Lost game start');
        const winnerIndex = String(game.player1_id) === String(ids[room.index * 2]) ? 0 : 1;
        for (let move = 0; move < 7; move++) {
          const socket = clients[move % 2 === 0 ? winnerIndex : 1 - winnerIndex]; const commandId = randomUUID();
          const input = { room_id: roomId, col: move % 2, commandId, expectedVersion: version };
          const result = listen(socket, 'command_ack', p => p.commandId === commandId);
          const before = performance.now(); socket.emit('drop_disc', input); const ack = await result;
          assert(ack.status === 'accepted', `Command rejected: ${JSON.stringify(ack)}`); accepted++; version = ack.version;
          latencies.push(performance.now() - before);
          if (move === 0) { const replay = listen(socket, 'command_ack', p => p.commandId === commandId); socket.emit('drop_disc', input); const repeated = await replay; assert(repeated.status === 'accepted' && repeated.version === version, 'Duplicate command changed outcome'); }
        }
        const finished = await db.collection('rooms').findOne({ _id: room._id }); assert(finished.finance_settled && finished.status === 'finished', 'Missing atomic settlement');
        assert(await db.collection('game_commands').countDocuments({ roomId, 'result.status': 'accepted' }) === 7, 'Lost or duplicated command receipts');
        assert(await db.collection('finance_journals').countDocuments({ operationId: `room:settle:${roomId}` }) === 1, 'Missing or duplicated settlement journal');
      });
      rounds++;
      assert(sockets.every(s => s.connected), 'Connection lost during load');
      console.log(JSON.stringify({ phase: 'round', rounds, accepted, players, elapsedSeconds: Math.round((performance.now() - started) / 1000) }));
      await wait(100);
    } while (performance.now() - started < durationSeconds * 1000);
    const totals = await db.collection('finance_accounts').aggregate([{ $match: { account: { $in: ids.map(id => `user:${id}:available`) } } }, { $group: { _id: null, sum: { $sum: '$balance' } } }]).toArray();
    const expected = players * 100000 - rounds * players / 2;
    assert(new (require('decimal.js'))(totals[0].sum.toString()).eq(String(expected)), 'Financial conservation failed');
    latencies.sort((a, b) => a - b);
    console.log(JSON.stringify({ passed: true, players, throughGateway, apiInstances: 2, rounds, accepted, duplicateEffects: 0, lostAcceptedCommands: 0, ackP95Ms: latencies[Math.ceil(latencies.length * .95) - 1], note: 'ACK includes network and queue time; scrape per-instance internal metrics separately' }));
  } finally {
    if (geoTimer) clearInterval(geoTimer);
    sockets.forEach(s => s.disconnect());
    if (tokens.length) await redis.del(tokens.map(token => `accessTokens:${token}`));
    await redis.quit(); await db.close();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
