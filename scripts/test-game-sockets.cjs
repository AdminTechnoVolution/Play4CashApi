// Disposable localhost-only end-to-end test. Requires two test API instances and dedicated Mongo/Redis.
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { createClient } = require('redis');
const { io } = require('../../Play4CashGateway/node_modules/socket.io-client');
const { randomUUID } = require('crypto');
const { performance } = require('perf_hooks');
const mongoUri = 'mongodb://127.0.0.1:27184/p4c_game_e2e?replicaSet=p4c-test';
const secret = 'p4c-e2e-test-only-secret-key-2026';
const throughGateway = process.env.P4C_TEST_GATEWAY === 'true';
const redisPid = process.env.P4C_TEST_REDIS_PID;
if (redisPid && !/^\d{3,8}$/.test(redisPid)) throw new Error('Invalid dedicated Redis test PID');
const sockets = [];
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
function expect(value, message) { if (!value) throw new Error(message); }
function listen(socket, event, predicate, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(event, listener); reject(new Error(`Timeout waiting for ${event}`)); }, timeout);
    const listener = value => { if (predicate(value)) { clearTimeout(timer); socket.off(event, listener); resolve(value); } };
    socket.on(event, listener);
  });
}
async function main() {
  const db = await mongoose.createConnection(mongoUri).asPromise();
  const redis = createClient({ url: 'redis://127.0.0.1:6388' }); await redis.connect();
  try {
    const ids = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
    const run = randomUUID();
    const catalogue = await db.collection('games').findOne({ socket_code: 'connect-four' });
    expect(catalogue, 'API did not initialize the game catalogue');
    await db.collection('games').updateOne({ _id: catalogue._id }, { $set: { turn_timer_seconds: 600 } });
    const roomId = new mongoose.Types.ObjectId();
    await db.collection('users').insertMany(ids.map((id, index) => ({ _id: id, email: `${run}-${index}@example.test`, username: `fixture-${index}-${run.slice(0, 6)}`, balance: 100, status: 'active' })));
    await db.collection('finance_eligibility').insertMany(ids.map(id => ({ userId: String(id), verifiedCountry: 'CO', observedCountry: 'CO', adultVerified: true, observedAt: new Date(), expiresAt: new Date(Date.now() + 3600000) })));
    await db.collection('rooms').insertOne({ _id: roomId, code: run, public: false, player_limit: 2, game_id: catalogue._id, bet_amount: 10, house_edge: 5,
      players: ids.map(id => ({ playerId: id, ready: true, moves: [], action_count: 0 })), spectators: [], status: 'started', source: 'casual', created_at: new Date() });
    for (let index = 0; index < 2; index++) {
      const token = jwt.sign({ id: String(ids[index]), email: `${run}-${index}@example.test`, typ: 'access', actor_type: 'player', jti: randomUUID() }, secret,
        { issuer: 'play4cash-api', audience: 'play4cash-clients', expiresIn: '10m' });
      await redis.set(`accessTokens:${token}`, '1', { EX: 600 });
      const socket = io(`http://127.0.0.1:${(throughGateway ? 3186 : 3184) + index}/connect-four`, { autoConnect: false, auth: { token, commandProtocol: '1' }, transports: ['websocket'], reconnection: false });
      sockets.push(socket);
      const connected = listen(socket, 'connect', () => true);
      socket.connect(); await connected;
    }
    let version = 0;
    let started = false;
    for (const socket of sockets) socket.on('connect-four', payload => {
      if (payload.data?.gameStarted && payload.data?.board) started = true;
      if (Number.isSafeInteger(payload.data?.stateVersion)) version = Math.max(version, payload.data.stateVersion);
    });
    for (const socket of sockets) socket.emit('join', { room_id: String(roomId) });
    for (let n = 0; n < 150 && !started; n++) await wait(100);
    expect(started, 'Game did not start on two different API instances');
    const game = await db.collection('connectfourgames').findOne({ room_id: roomId });
    expect(game, 'Game state was not committed');
    const actorForOne = String(game.player1_id) === String(ids[0]) ? 0 : 1;
    const latencies = [];
    let outageRetry;
    for (let move = 0; move < 7; move++) {
      const player = move % 2 === 0 ? actorForOne : 1 - actorForOne;
      const col = move % 2 === 0 ? 0 : 1;
      const commandId = move === 1 && outageRetry ? outageRetry.commandId : randomUUID();
      const input = move === 1 && outageRetry ? outageRetry : { room_id: String(roomId), col, commandId, expectedVersion: version };
      const response = listen(sockets[player], 'command_ack', ack => ack.commandId === commandId);
      const start = performance.now(); sockets[player].emit('drop_disc', input);
      const ack = await response;
      latencies.push(performance.now() - start);
      expect(ack.status === 'accepted', `Move ${move} rejected: ${JSON.stringify(ack)}`);
      version = ack.version;
      if (move === 0) {
        const duplicate = listen(sockets[player], 'command_ack', value => value.commandId === commandId);
        sockets[player].emit('drop_disc', input);
        const replayed = await duplicate;
        expect(replayed.status === 'accepted' && replayed.version === ack.version, 'Duplicate command did not replay the original result');
        const unchanged = await db.collection('connectfourgames').findOne({ room_id: roomId });
        expect(unchanged.move_revision === 1, 'Duplicate move was applied twice');
        if (redisPid) {
          const nextPlayer = 1 - actorForOne;
          outageRetry = { room_id: String(roomId), col: 1, commandId: randomUUID(), expectedVersion: version };
          let prematurelyAccepted = false;
          const observe = value => { if (value.commandId === outageRetry.commandId && value.status === 'accepted') prematurelyAccepted = true; };
          sockets[nextPlayer].on('command_ack', observe);
          process.kill(Number(redisPid), 'SIGSTOP');
          try {
            await wait(100);
            sockets[nextPlayer].emit('drop_disc', outageRetry);
            await wait(2500);
            expect(!prematurelyAccepted, 'Redis outage prematurely acknowledged a move');
            const frozen = await db.collection('connectfourgames').findOne({ room_id: roomId });
            expect(frozen.move_revision === 1, 'Unauthorized move ran while Redis was unavailable');
          } finally { process.kill(Number(redisPid), 'SIGCONT'); sockets[nextPlayer].off('command_ack', observe); }
          await redis.ping();
          await wait(200);
        }
      }
    }
    const completed = await db.collection('rooms').findOne({ _id: roomId });
    expect(completed.status === 'finished' && completed.finance_settled, 'Terminal game and award were not committed together');
    const winner = String(game.player1_id);
    for (const id of ids) {
      const account = await db.collection('finance_accounts').findOne({ account: `user:${id}:available` });
      expect(account.balance.toString() === (String(id) === winner ? '109.000000' : '90.000000'), 'Winner/loser money is incorrect');
    }
    const stored = await db.collection('game_commands').countDocuments({ roomId: String(roomId), 'result.status': 'accepted' });
    expect(stored === 7, 'Accepted move receipts were lost');
    latencies.sort((a, b) => a - b);
    console.log(JSON.stringify({ passed: true, apiInstances: 2, throughGateway, redisOutageVerified: !!redisPid, players: 2, acceptedMoves: stored, duplicateMoves: 0,
      winnerBalance: '109.000000', loserBalance: '90.000000', ackP95Ms: Number(latencies[Math.floor(latencies.length * .95)].toFixed(2)) }));
  } finally {
    for (const socket of sockets) socket.disconnect();
    await redis.quit(); await db.close();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
