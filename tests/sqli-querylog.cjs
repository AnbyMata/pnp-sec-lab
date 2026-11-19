// E2E: T14 request-aware server query log — path/method capture, filters, nginx.
// Run: docker compose up -d, then `node tests/sqli-querylog.cjs`.
const assert = require('node:assert/strict');

const LAB = 'http://localhost:10002';
const PORTAL = 'http://localhost:8000';

const getLog = async (base, query) => {
  const response = await fetch(`${base}/lab/querylog${query}`);
  assert.ok(response.ok, `GET ${base}/lab/querylog${query} -> ${response.status}`);
  return response.json();
};

const postLogin = async (userId, password) => {
  const response = await fetch(`${LAB}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ user_id: userId, password }).toString(),
    redirect: 'manual'
  });
  assert.ok(response.status < 500, `login request failed: ${response.status}`);
};

(async () => {
  // 1. normal + injected login attempts log path '/login' and method 'POST'
  await postLogin('test', 'test1234');
  await postLogin("admin'-- ", 'x');
  const logins = await getLog(LAB, '?paths=/login&limit=20');
  assert.ok(logins.entries.length >= 2, 'expected at least 2 login entries');
  assert.ok(logins.entries.every((e) => e.path === '/login'), 'non-/login path in /login filter');
  assert.ok(logins.entries.every((e) => e.method === 'POST'), 'login method not recorded as POST');
  assert.ok(logins.entries.some((e) => e.sql.includes("user_id='test'")), 'normal login SQL missing');
  assert.ok(logins.entries.some((e) => e.sql.includes("admin'--")), 'injected login SQL missing');

  // 2. a /board request lands in /board filter, not in /login filter
  await fetch(`${LAB}/board`);
  const board = await getLog(LAB, '?paths=/board&limit=5');
  assert.ok(board.entries.length >= 1, 'expected a /board entry');
  assert.ok(board.entries.every((e) => e.path === '/board'), 'non-/board path in /board filter');
  const loginsAfter = await getLog(LAB, '?paths=/login&limit=20');
  assert.ok(loginsAfter.entries.every((e) => e.path === '/login'), '/board entry leaked into /login filter');

  // 3. limit=1 returns exactly one entry while total counts all matches
  const one = await getLog(LAB, '?paths=/login&limit=1');
  assert.equal(one.entries.length, 1, 'limit=1 did not return exactly 1 entry');
  assert.ok(one.total > 1, `total ${one.total} should exceed shown count`);
  assert.ok(Number.isInteger(one.total));

  // 4. seq is a monotonic integer counter (entries arrive newest-first)
  const seqs = loginsAfter.entries.map((e) => e.seq);
  assert.ok(seqs.every((s) => Number.isInteger(s) && s > 0), 'seq must be a positive integer');
  for (let i = 1; i < seqs.length; i += 1) {
    assert.ok(seqs[i - 1] > seqs[i], `seq not increasing over time: ${seqs[i - 1]} then ${seqs[i]}`);
  }

  // 5. nginx forwards the query string: same filter through the portal
  const portalLog = await (await fetch(`${PORTAL}/api/lab/querylog?paths=/login&limit=1`)).json();
  assert.equal(portalLog.entries.length, 1, 'portal limit=1 not applied');
  assert.ok(portalLog.total > 1, 'portal total missing');
  assert.equal(portalLog.entries[0].path, '/login', 'portal paths filter not applied');

  // 6. /health and /lab/querylog requests do not create entries themselves
  await fetch(`${LAB}/health`);
  const health = await getLog(LAB, '?paths=/health&limit=5');
  assert.equal(health.entries.length, 0, '/health must not be logged');
  const self = await getLog(LAB, '?paths=/lab/querylog&limit=5');
  assert.equal(self.entries.length, 0, '/lab/querylog must not be logged');

  console.log('PASS sqli-querylog filters');
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
