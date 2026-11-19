// E2E (W1): tools-proxy allowlist relay via portal /api/tools/request + /lab/echo.
// Run: docker compose up -d, then `node tests/tools-proxy.cjs`.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

const PORTAL = 'http://localhost:8000';
const API = `${PORTAL}/api/tools/request`;
const ECHO = 'http://localhost:10002/lab/echo';

(async () => {
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`${PORTAL}/login.html`); // same-origin portal page
    const send = (payload) => page.evaluate(async (p) => {
      const r = await fetch('/api/tools/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(p)
      });
      return { status: r.status, data: await r.json().catch(() => null) };
    }, payload);
    const decode = (b64) => JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));

    // 1. GET and POST reach /lab/echo with method, body and user headers intact
    let r = await send({ method: 'GET', url: `${ECHO}?probe=1` });
    assert.equal(r.status, 200, `GET proxy status ${r.status}`);
    assert.ok(r.data.ok, 'expected ok:true');
    let echo = decode(r.data.result.body_b64);
    assert.equal(echo.method, 'GET');
    assert.equal(echo.path, '/lab/echo');
    assert.equal(echo.query, 'probe=1');
    r = await send({
      method: 'POST', url: ECHO,
      headers: [['X-Marker', 'w1-proxy']],
      body_b64: Buffer.from('pnp-echo-body').toString('base64')
    });
    assert.ok(r.data.ok);
    echo = decode(r.data.result.body_b64);
    assert.equal(echo.method, 'POST');
    assert.equal(echo.body_len, 13);
    assert.equal(Buffer.from(echo.body_b64, 'base64').toString(), 'pnp-echo-body');
    assert.equal(echo.headers['x-marker'], 'w1-proxy');
    assert.ok(r.data.result.headers.length > 0, 'response headers missing');
    assert.ok(Number.isInteger(r.data.result.elapsed_ms) && Number.isInteger(r.data.result.ttfb_ms));

    // 2. disallowed URLs are rejected with 403
    for (const url of [
      'http://example.com',
      'http://localhost:9999',
      'http://python:0/lab/echo',
      'http://localhost:10002@evil.com/',
      'http://evil.com#@localhost:10002/'
    ]) {
      r = await send({ method: 'GET', url });
      assert.equal(r.status, 403, `expected 403 for ${url}, got ${r.status}`);
    }

    // 3. redirects are returned, not followed (/logout -> 303)
    r = await send({ method: 'GET', url: 'http://localhost:10002/logout' });
    assert.ok(r.data.ok);
    assert.ok(r.data.result.status >= 300 && r.data.result.status < 400,
      `expected 3xx passthrough, got ${r.data.result.status}`);

    // 4. duplicate response headers are preserved as list entries (login sets cookies)
    r = await send({
      method: 'POST', url: 'http://localhost:10002/login',
      headers: [['Content-Type', 'application/x-www-form-urlencoded']],
      body_b64: Buffer.from('user_id=test&password=test1234').toString('base64')
    });
    const setCookies = r.data.result.headers.filter(([n]) => n.toLowerCase() === 'set-cookie');
    assert.ok(setCookies.length >= 1, `expected >=1 Set-Cookie entries, got ${setCookies.length}`);
    assert.ok(setCookies.length === r.data.result.headers.filter(([n]) => n === 'set-cookie' || n === 'Set-Cookie').length,
      'header name case unexpectedly normalized');

    // 5. count=10: simultaneous start (start_ms spread <=150ms) and tight echo times
    r = await send({ method: 'GET', url: ECHO, count: 10 });
    assert.ok(r.data.ok);
    assert.equal(r.data.results.length, 10);
    const starts = r.data.results.map((x) => x.start_ms);
    const spread = Math.max(...starts) - Math.min(...starts);
    assert.ok(spread <= 150, `start_ms spread ${spread}ms exceeds 150ms`);
    assert.ok(r.data.results.every((x) => x.status === 200), 'batch entries not all 200');
    const received = r.data.results.map((x) => decode(x.body_b64).received_at);
    const echoSpread = Math.max(...received) - Math.min(...received);
    assert.ok(echoSpread < 1.0, `echo received_at spread ${echoSpread}s too large`);

    // 6. validation: CRLF header -> 400, >1MB body -> 413, bad Origin -> 403
    r = await send({ method: 'GET', url: ECHO, headers: [['X-A', '1\r\nInjected: yes']] });
    assert.equal(r.status, 400, `CRLF header expected 400, got ${r.status}`);
    r = await send({
      method: 'POST', url: ECHO,
      body_b64: Buffer.alloc(1024 * 1024 + 1).toString('base64')
    });
    assert.equal(r.status, 413, `oversize body expected 413, got ${r.status}`);
    const badOrigin = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://evil.example' },
      body: JSON.stringify({ method: 'GET', url: ECHO })
    });
    assert.equal(badOrigin.status, 403, `bad Origin expected 403, got ${badOrigin.status}`);
    const noJson = await fetch(API, {
      method: 'POST',
      headers: { Origin: 'http://localhost:8000' },
      body: JSON.stringify({ method: 'GET', url: ECHO })
    });
    assert.equal(noJson.status, 403, `missing JSON Content-Type expected 403, got ${noJson.status}`);

    // 6b. malformed body fields are client errors (400), never 500
    r = await send({ method: 'GET', url: ECHO, body_b64: 1 });
    assert.equal(r.status, 400, `non-string body_b64 expected 400, got ${r.status}`);
    r = await send({ method: 'GET', url: ECHO, body_b64: '%%%not-base64%%%' });
    assert.equal(r.status, 400, `invalid base64 expected 400, got ${r.status}`);

    // 6c. C0/DEL control chars in URL -> 400 bad-url (never reaches urlsplit)
    for (const badUrl of [
      `${ECHO}\r\n`, `${ECHO}\n`, 'http://localhost:10002/lab/\techo',
      `${ECHO}\x00x`, `${ECHO}?a=\x7f`
    ]) {
      r = await send({ method: 'GET', url: badUrl });
      assert.equal(r.status, 400, `control-char URL expected 400, got ${r.status}`);
      assert.equal(r.data && r.data.error, 'bad-url', `control-char URL must fail as bad-url`);
    }

    console.log('PASS tools-proxy');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
