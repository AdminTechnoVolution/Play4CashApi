// Read-only HTTP metrics from dedicated test APIs using a disposable test admin.
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const { createClient } = require('redis');
const { randomUUID } = require('crypto');
(async () => {
  const db = await mongoose.createConnection('mongodb://127.0.0.1:27184/p4c_game_e2e?replicaSet=p4c-test').asPromise();
  const redis = createClient({ url: 'redis://127.0.0.1:6388' }); await redis.connect();
  const id = new mongoose.Types.ObjectId(); let token;
  try {
    await db.collection('admins').insertOne({ _id: id, email: `${randomUUID()}@example.test`, display_name: 'Disposable metrics reader', status: 'active', created_source: 'test' });
    token = jwt.sign({ id: String(id), typ: 'access', actor_type: 'admin', role: 'admin' }, 'p4c-e2e-test-only-admin-secret-2026', { issuer: 'play4cash-api', audience: 'play4cash-admin', expiresIn: '1m' });
    await redis.set(`admin:accessTokens:${token}`, '1', { EX: 60 });
    for (const port of [3184, 3185]) {
      const response = await fetch(`http://127.0.0.1:${port}/api/admin/payments/health`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error(`Metrics HTTP ${response.status} on test port ${port}`);
      console.log(JSON.stringify({ port, health: (await response.json()).data }));
    }
  } finally {
    if (token) await redis.del(`admin:accessTokens:${token}`);
    await db.collection('admins').deleteOne({ _id: id });
    await redis.quit(); await db.close();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
