// W8: attacker server — page store, callback sink, admin API, origin isolation.
// Run: docker compose up -d --build attacker nginx, then `node tests/attacker.cjs`.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

const PORTAL = 'http://localhost:8000';
const ADMIN = `${PORTAL}/api/attacker`;
const PUB = 'http://localhost:10010';
const PUB_X = 'http://127.0.0.1:10010';
const ORIGIN = 'http://localhost:8000';

const sid = 's' + Date.now().toString(36) + 'x'.repeat(24);
const sid2 = 't' + Date.now().toString(36) + 'y'.repeat(24);

const admin = async (method, path, body, origin = ORIGIN) => {
  const r = await fetch(ADMIN + path, {
    method,
    headers: { Origin: origin, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  return { status: r.status, json: await r.json().catch(() => null) };
};

(async () => {
  // ① page round trip: PUT via admin -> GET on both public URL variants
  const html = '<!doctype html><title>poc</title><h1>hello attacker</h1>';
  const put = await admin('PUT', '/pages/poc', { sid, html });
  assert.equal(put.status, 200, `PUT /pages -> ${put.status}`);
  assert.equal(put.json.ok, true);
  assert.equal(put.json.page_urls.cross_site, `${PUB_X}/p/${sid}/poc`);
  assert.equal(put.json.page_urls.same_site, `${PUB}/p/${sid}/poc`);
  for (const base of [PUB, PUB_X]) {
    const r = await fetch(`${base}/p/${sid}/poc`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/html.*utf-8/);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(await r.text(), html);
  }
  const list = await admin('GET', `/pages?sid=${sid}`);
  assert.deepEqual(list.json.pages, ['poc']);
  assert.equal(list.json.urls.cb_cross_site, `${PUB_X}/cb/${sid}/`);

  // ② sid isolation: other sid sees neither pages nor callbacks
  const list2 = await admin('GET', `/pages?sid=${sid2}`);
  assert.deepEqual(list2.json.pages, [], 'other sid must not see the page');
  assert.equal((await fetch(`${PUB}/p/${sid2}/poc`)).status, 404, 'page under wrong sid 404');
  await fetch(`${PUB}/cb/${sid}/hit?a=1`, { headers: { 'X-Marker': 'w8-e2e' } });
  const cbs2 = await admin('GET', `/callbacks?sid=${sid2}&after=0`);
  assert.equal(cbs2.json.callbacks.length, 0, 'other sid must not see callbacks');

  // ③ callback recording: method/query/headers/body + after filter
  await fetch(`${PUB}/cb/${sid}/hit?a=1`);
  const post = await fetch(`${PUB}/cb/${sid}/submit?k=v`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', 'X-Tag': 't1' },
    body: 'callback-body'
  });
  assert.equal(post.status, 200);
  assert.equal(await post.text(), 'ok');
  const cbs = await admin('GET', `/callbacks?sid=${sid}&after=0`);
  assert.equal(cbs.json.callbacks.length, 3);
  const cb = cbs.json.callbacks[2];
  assert.equal(cb.method, 'POST');
  assert.match(cb.path, /\/cb\/.*\/submit/);
  assert.equal(cb.query, 'k=v');
  assert.equal(cb.body, 'callback-body');
  assert.ok(cb.headers.some(([k, v]) => k.toLowerCase() === 'x-tag' && v === 't1'));
  assert.ok(cb.seq > 0 && cb.ts && cb.ip);
  const after = await admin('GET', `/callbacks?sid=${sid}&after=${cbs.json.callbacks[1].seq}`);
  assert.deepEqual(after.json.callbacks.map((c) => c.seq), [cbs.json.callbacks[2].seq], 'after must return only newer entries');
  // OPTIONS preflight -> 204 with wildcard CORS
  const pre = await fetch(`${PUB}/cb/${sid}/x`, { method: 'OPTIONS' });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), '*');

  // ④ bounds: 101KB page rejected, 21st page rejected, 201st callback evicts oldest
  const big = await admin('PUT', '/pages/big', { sid, html: 'x'.repeat(101 * 1024) });
  assert.equal(big.status, 413, 'page >100KB must be rejected');
  for (let i = 1; i <= 19; i++) {
    const r = await admin('PUT', `/pages/pg${i}`, { sid, html: `p${i}` });
    assert.equal(r.status, 200, `page ${i} should store`);
  }
  const over = await admin('PUT', '/pages/pg20', { sid, html: 'x' });
  assert.equal(over.status, 400, '21st page must be rejected');
  for (let i = 0; i < 200; i++) await fetch(`${PUB}/cb/${sid}/n${i}`);
  const ring = await admin('GET', `/callbacks?sid=${sid}&after=0`);
  assert.equal(ring.json.callbacks.length, 200, 'ring buffer must cap at 200');
  // 203 recorded (3 earlier + 200 n*) -> first three evicted, n0 is the oldest kept
  assert.equal(ring.json.callbacks[0].path, `/cb/${sid}/n0`, 'oldest entry evicted');
  // clear callbacks
  const del = await admin('DELETE', `/callbacks?sid=${sid}`);
  assert.equal(del.json.ok, true);
  const afterDel = await admin('GET', `/callbacks?sid=${sid}&after=0`);
  assert.equal(afterDel.json.callbacks.length, 0, 'DELETE must clear callbacks');
  // delete one page
  const dp = await admin('DELETE', `/pages/poc?sid=${sid}`);
  assert.equal(dp.json.removed, true);
  assert.equal((await fetch(`${PUB}/p/${sid}/poc`)).status, 404);

  // ⑤ bad Origin -> 403 on admin API
  const badPut = await admin('PUT', '/pages/x', { sid, html: 'y' }, 'http://evil.example');
  assert.equal(badPut.status, 403, 'bad Origin PUT must be 403');
  const badGet = await admin('GET', `/pages?sid=${sid}`, undefined, 'http://evil.example');
  assert.equal(badGet.status, 403, 'bad Origin GET must be 403');
  // malformed inputs
  assert.equal((await admin('PUT', '/pages/BadName', { sid, html: 'x' })).status, 400);
  assert.equal((await admin('PUT', '/pages/ok', { sid: 'short', html: 'x' })).status, 400);

  // ⑥ origin isolation + CORS read rejection (browser)
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    const r = await admin('PUT', '/pages/xss', { sid, html: '<!doctype html><h1>atk</h1>' });
    const crossUrl = r.json.page_urls.cross_site;
    assert.notEqual(new URL(crossUrl).origin, new URL(PORTAL).origin, 'public page must be a different origin');
    await page.goto(crossUrl);
    assert.match(await page.innerText('body'), /atk/);
    const corsBlocked = await page.evaluate(async () => {
      try {
        const res = await fetch('http://localhost:8000/api/config');
        await res.text();
        return false;
      } catch { return true; }
    });
    assert.equal(corsBlocked, true, 'portal response must not be readable cross-origin (no CORS)');
  } finally {
    await browser.close();
  }

  // ⑦ workbench -> allowed /api/tools/request -> public callback URL
  const viaWb = await fetch(`${PORTAL}/api/tools/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
    body: JSON.stringify({ url: `${PUB}/cb/${sid}/via-workbench`, method: 'GET' })
  });
  const wbJson = await viaWb.json();
  assert.equal(wbJson.ok, true, 'workbench must be allowed to reach attacker public port');
  assert.equal(wbJson.result.status, 200);
  const cbFinal = await admin('GET', `/callbacks?sid=${sid}&after=0`);
  assert.ok(cbFinal.json.callbacks.some((c) => c.path.endsWith('/via-workbench')), 'workbench callback must be recorded');

  // TTL regression: recreate attacker with a 3s page TTL — deterministic expiry.
  const { execSync } = require('node:child_process');
  const upAttacker = (ttl) => execSync('docker compose up -d attacker', {
    env: { ...process.env, ATTACKER_PAGE_TTL: ttl }, stdio: 'ignore'
  });
  const waitPub = async () => {
    for (let i = 0; i < 30; i++) {
      try { if ((await fetch(`${PUB}/cb/abcdefghijklmnop/health`, { method: 'OPTIONS' })).status === 204) return; }
      catch { }
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error('attacker public port never came up');
  };
  try {
    upAttacker('3');
    await waitPub();
    const tput = await admin('PUT', '/pages/ttl', { sid, html: 'expires' });
    assert.equal(tput.status, 200);
    assert.equal((await fetch(`${PUB}/p/${sid}/ttl`)).status, 200, 'page serves before TTL');
    await new Promise((r) => setTimeout(r, 3500));
    assert.equal((await fetch(`${PUB}/p/${sid}/ttl`)).status, 404, 'page must 404 after TTL');
    // callbacks refresh activity only — must not resurrect the expired page set
    assert.equal((await fetch(`${PUB}/cb/${sid}/after-expiry`)).status, 200);
    assert.equal((await fetch(`${PUB}/p/${sid}/ttl`)).status, 404, 'callback must not resurrect expired pages');
  } finally {
    upAttacker('7200');
    await waitPub();
  }

  console.log('PASS attacker');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
