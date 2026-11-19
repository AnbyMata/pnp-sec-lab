// W6: general event log on top of the query log.
// Run: docker compose up -d, then `node tests/server-events.cjs`.
const assert = require('node:assert/strict');

const LAB = 'http://localhost:10002';
// /oracle fetches server-side from inside the python container, where the
// lab app listens on port 8000 (host port 10002 is only the published mapping).
const NOTE_URL = 'http://localhost:8000/lab/internal-note';

const qlog = async (qs) => {
  const r = await fetch(`${LAB}/lab/querylog?${qs}`);
  assert.equal(r.status, 200, `querylog ${qs} -> ${r.status}`);
  return r.json();
};

const latestFile = async (extra = '') => {
  const { entries } = await qlog(`kinds=file&paths=/lab/file&limit=20${extra}`);
  return entries;
};

(async () => {
  // 1) /lab/file success -> kind 'file', note 'ok'
  const okRes = await fetch(`${LAB}/lab/file?name=welcome.txt`);
  assert.equal(okRes.status, 200, 'welcome.txt should be served');
  const okBody = await okRes.text();
  assert.ok(okBody.length > 0);
  let entries = await latestFile();
  const okEntry = entries.find((e) => e.detail === 'welcome.txt' && e.note === 'ok');
  assert.ok(okEntry, 'expected a file event for welcome.txt');
  assert.equal(okEntry.kind, 'file');
  assert.equal(okEntry.ok, true);
  assert.equal(okEntry.path, '/lab/file');
  assert.equal(okEntry.method, 'GET');
  assert.ok(okEntry.seq > 0 && okEntry.ts);

  // 2) not-found and out-of-scope denied — response behaviour unchanged (404)
  const nfRes = await fetch(`${LAB}/lab/file?name=missing.txt`);
  assert.equal(nfRes.status, 404, 'missing file still 404');
  const deniedRes = await fetch(`${LAB}/lab/file?name=${encodeURIComponent('../../etc/hostname')}`);
  assert.equal(deniedRes.status, 404, 'out-of-scope path still 404');
  entries = await latestFile();
  const nfEntry = entries.find((e) => e.detail === 'missing.txt' && e.note === 'not-found');
  assert.ok(nfEntry, 'expected not-found file event');
  assert.equal(nfEntry.ok, false);
  const deniedEntry = entries.find((e) => e.detail === '../../etc/hostname' && e.note === 'denied');
  assert.ok(deniedEntry, 'expected denied file event');
  assert.equal(deniedEntry.ok, false);

  // 2b) >300-char name (multi-component so path resolution survives):
  // still 404, stored detail truncated to the bound, prefix intact
  const longName = 'a/'.repeat(249) + 'ab'; // 500 chars, no component >255
  const longRes = await fetch(`${LAB}/lab/file?name=${encodeURIComponent(longName)}`);
  assert.equal(longRes.status, 404, 'long name still 404');
  entries = await latestFile();
  const longEntry = entries.find((e) => e.note === 'not-found' && e.detail.startsWith('a/'.repeat(25)));
  assert.ok(longEntry, 'expected file event for the long name');
  assert.ok(longEntry.detail.length <= 300, `detail length ${longEntry.detail.length} exceeds bound`);
  assert.equal(longEntry.detail, longName.slice(0, 300));

  // 3) /oracle outbound fetch -> kind 'http-out' with URL + status (lab-internal URL only)
  const orRes = await fetch(`${LAB}/oracle?url=${encodeURIComponent(NOTE_URL)}`);
  assert.equal(orRes.status, 200);
  const orBody = await orRes.text();
  assert.ok(orBody.includes('internal note'), 'oracle should render internal-note body');
  const { entries: outEntries } = await qlog('kinds=http-out&limit=20');
  const outEntry = outEntries.find((e) => e.detail === NOTE_URL);
  assert.ok(outEntry, 'expected http-out event for internal-note URL');
  assert.equal(outEntry.kind, 'http-out');
  assert.equal(outEntry.ok, true);
  assert.match(outEntry.note, /200/);
  assert.equal(outEntry.path, '/oracle');

  // 4) query entries keep all original fields + kind 'query'
  const login = await fetch(`${LAB}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'user_id=test&password=test1234',
    redirect: 'manual'
  });
  assert.ok([200, 303].includes(login.status));
  const { entries: qEntries } = await qlog('kinds=query&paths=/login&limit=1');
  const q = qEntries[0];
  for (const f of ['seq', 'time', 'sql', 'rows', 'error', 'path', 'method']) {
    assert.ok(f in q, `query entry missing original field ${f}`);
  }
  assert.equal(q.kind, 'query');
  assert.equal(q.path, '/login');
  assert.equal(q.method, 'POST');
  assert.match(q.sql, /member_modern/);

  // 5) no kinds filter -> mixed kinds, seq strictly descending (newest first)
  const { entries: all } = await qlog('limit=20');
  const kindSet = new Set(all.map((e) => e.kind));
  for (const k of ['query', 'file', 'http-out']) {
    assert.ok(kindSet.has(k), `expected kind ${k} in unfiltered entries, got ${[...kindSet]}`);
  }
  for (let i = 1; i < all.length; i++) {
    assert.ok(all[i - 1].seq > all[i].seq, 'entries must be seq-descending');
  }

  console.log('PASS server-events');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
