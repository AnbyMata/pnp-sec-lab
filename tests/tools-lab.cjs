// E2E: tools-lab page + request-workbench tool (W2).
// Run: docker compose up -d, then `node tests/tools-lab.cjs`.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

const PORTAL = 'http://localhost:8000';
const ECHO = 'http://localhost:10002/lab/echo';

(async () => {
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    const cbReqs = [];
    page.on('request', (r) => { if (r.url().includes('/api/attacker/callbacks')) cbReqs.push(r.url()); });
    await page.goto(`${PORTAL}/tools-lab.html`);
    const wb = page.locator('#tl-panel-workbench');
    const statusText = async () => (await wb.locator('.wb-status').innerText()).trim();
    const bodyText = async () => wb.locator('.wb-resp-body').innerText();
    let echo;
    let echoed;
    const waitResponse = () =>
      page.waitForFunction(() => {
        const el = document.querySelector('#tl-panel-workbench .wb-response');
        return el && !el.hidden;
      });

    // Tab layout: registered tools visible, unimplemented ones hidden.
    assert.equal(await page.locator('#tl-workbench').evaluate((n) => !n.hidden), true);
    assert.equal(await page.locator('#tl-query-lab').evaluate((n) => !n.hidden), true);
    assert.equal(await page.locator('#tl-terminal').evaluate((n) => !n.hidden), true);
    assert.equal(await page.locator('#tl-inspector').evaluate((n) => !n.hidden), true);
    assert.equal(await page.locator('#tl-server-log').evaluate((n) => !n.hidden), true);
    assert.equal(await page.locator('#tl-exploit').evaluate((n) => !n.hidden), true);

    // 1) GET /lab/echo -> 200 + method echoed
    assert.ok(await wb.locator('.wb-method').count() > 0);
    assert.ok(await wb.locator('.wb-url').count() > 0);
    assert.ok(await wb.locator('.wb-send').count() > 0);
    await wb.locator('.wb-url').fill(ECHO);
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/tools/request')),
      wb.locator('.wb-send').click()
    ]);
    await waitResponse();
    assert.match(await wb.locator('.wb-badge').innerText(), /\b200\b/);
    assert.match(await bodyText(), /"method":\s*"GET"/);

    // 2) custom request header is echoed back
    await wb.locator('.wb-hrow .wb-hname').last().fill('X-Marker');
    await wb.locator('.wb-hrow .wb-hvalue').last().fill('w2-e2e');
    await wb.locator('.wb-send').click();
    await page.waitForFunction(() =>
      document.querySelector('#tl-panel-workbench .wb-resp-body').textContent.includes('w2-e2e'));
    assert.match(await bodyText(), /"x-marker":\s*"w2-e2e"/);

    // 3) disallowed URL -> understandable Korean error
    await wb.locator('.wb-url').fill('http://example.com');
    await wb.locator('.wb-send').click();
    await page.waitForFunction(() =>
      document.querySelector('#tl-panel-workbench .wb-status').textContent.includes('허용되지 않는'));
    assert.match(await statusText(), /허용되지 않는/);

    // 4) preset fills the editor
    await wb.locator('.wb-presets').selectOption({ label: 'Echo POST' });
    assert.equal(await wb.locator('.wb-method').inputValue(), 'POST');
    assert.equal(await wb.locator('.wb-url').inputValue(), ECHO);
    assert.equal(await wb.locator('.wb-body').inputValue(), 'hello tools-lab');

    // Body mode Content-Type is filled automatically, then a student edit is preserved.
    await wb.locator('.wb-bmode-btn[data-mode="json"]').click();
    const ctIndex = await wb.locator('.wb-hrow').evaluateAll((rows) =>
      rows.findIndex((row) => row.querySelector('.wb-hname').value.toLowerCase() === 'content-type'));
    assert.ok(ctIndex >= 0);
    const ct = wb.locator('.wb-hrow').nth(ctIndex).locator('.wb-hvalue');
    assert.equal(await ct.inputValue(), 'application/json');
    await ct.fill('application/custom');
    await wb.locator('.wb-bmode-btn[data-mode="form"]').click();
    assert.equal(await ct.inputValue(), 'application/custom');
    await ct.fill('application/x-www-form-urlencoded');
    await wb.locator('.wb-bmode-btn[data-mode="json"]').click();
    await wb.locator('.wb-body').fill('{bad json');
    await page.waitForFunction(() => document.querySelector('#tl-panel-workbench .wb-json-err').textContent.includes('전송은 가능합니다'));
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/tools/request')),
      wb.locator('.wb-send').click()
    ]);
    echo = JSON.parse(await bodyText());
    assert.equal(Buffer.from(echo.body_b64, 'base64').toString(), '{bad json');
    await wb.locator('.wb-bmode-btn[data-mode="form"]').click();

    // 5) response content renders as text only — never becomes DOM
    const PAYLOAD = '<script>alert(1)</script><img src=x onerror=alert(2)>';
    await wb.locator('button.wb-add-header').filter({ hasText: '헤더 추가' }).click();
    await wb.locator('.wb-hrow .wb-hname').last().fill('X-Evil');
    await wb.locator('.wb-hrow .wb-hvalue').last().fill(PAYLOAD);
    await wb.locator('.wb-send').click();
    await page.waitForFunction(() =>
      document.querySelector('#tl-panel-workbench .wb-resp-body').textContent.includes('<script>alert(1)</script>'));
    const evil = await bodyText();
    assert.ok(evil.includes('<script>alert(1)</script>'));
    assert.ok(evil.includes('<img src=x onerror=alert(2)>'));
    assert.equal(await wb.locator('.wb-response img').count(), 0);
    assert.equal(await wb.locator('.wb-response script').count(), 0);
    assert.equal(await wb.locator('.wb-response iframe').count(), 0);

    // 6) multipart body: filename + part Content-Type travel verbatim to /lab/echo
    await wb.locator('.wb-bmode-btn[data-mode="multipart"]').click();
    await wb.locator('.wb-part .wb-pname').last().fill('upload');
    await wb.locator('.wb-part .wb-pfile').last().fill('../shell.php');
    await wb.locator('.wb-part .wb-pct').last().fill('image/png');
    await wb.locator('.wb-part .wb-ptext').last().fill('<?php echo 1;?>');
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/tools/request')),
      wb.locator('.wb-send').click()
    ]);
    await page.waitForFunction(() => {
      const el = document.querySelector('#tl-panel-workbench .wb-resp-body');
      if (!el) return false;
      try {
        const j = JSON.parse(el.textContent);
        return !!(j.body_b64 && atob(j.body_b64).includes('filename="../shell.php"'));
      } catch { return false; }
    });
    echo = JSON.parse(await bodyText());
    echoed = Buffer.from(echo.body_b64, 'base64').toString('latin1');
    assert.ok(echoed.includes('filename="../shell.php"'), 'filename must pass verbatim');
    assert.ok(echoed.includes('Content-Type: image/png'), 'part Content-Type must pass verbatim');
    assert.ok(echoed.includes('<?php echo 1;?>'));

    // A selected file is transmitted byte-for-byte, including non-text bytes.
    await wb.locator('.wb-part .wb-pfile').last().fill('selected.bin');
    await wb.locator('.wb-part .wb-pick').last().setInputFiles({
      name: 'selected.bin', mimeType: 'application/octet-stream', buffer: Buffer.from([0, 255, 65])
    });
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/tools/request')),
      wb.locator('.wb-send').click()
    ]);
    echo = JSON.parse(await bodyText());
    echoed = Buffer.from(echo.body_b64, 'base64');
    assert.notEqual(echoed.indexOf(Buffer.from([0, 255, 65])), -1, 'selected file bytes must remain unchanged');

    // 7) cookie jar: POST /login Set-Cookie stored + auto-attached to the next echo request
    await wb.locator('.wb-bmode-btn[data-mode="form"]').click();
    await wb.locator('.wb-form-rows .wb-fkey').last().fill('user_id');
    await wb.locator('.wb-form-rows .wb-fval').last().fill('test');
    await wb.locator('.wb-form').locator('button', { hasText: '필드 추가' }).click();
    await wb.locator('.wb-form-rows .wb-fkey').last().fill('password');
    await wb.locator('.wb-form-rows .wb-fval').last().fill('test1234');
    await wb.locator('.wb-url').fill('http://localhost:10002/login');
    await wb.locator('.wb-send').click();
    await page.waitForFunction(() =>
      document.querySelector('#tl-panel-workbench .wb-badge').textContent.includes('303'));
    assert.match(await wb.locator('.wb-badge').innerText(), /303/);
    const jarText = await wb.locator('.wb-jar-list').innerText();
    assert.ok(jarText.includes('session'), 'jar should list the session cookie');
    // next echo request to the same hostname auto-attaches Cookie
    await wb.locator('.wb-url').fill(ECHO);
    await wb.locator('.wb-method').selectOption('GET');
    await wb.locator('.wb-bmode-btn[data-mode="raw"]').click();
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/tools/request')),
      wb.locator('.wb-send').click()
    ]);
    await page.waitForFunction(() =>
      document.querySelector('#tl-panel-workbench .wb-resp-body').textContent.includes('"cookie"'));
    echo = JSON.parse(await bodyText());
    assert.ok(echo.headers.cookie && echo.headers.cookie.includes('session='),
      'echo should see the auto-attached Cookie header');

    // A user-supplied Cookie header takes precedence over the jar.
    await wb.locator('button.wb-add-header').filter({ hasText: '헤더 추가' }).click();
    await wb.locator('.wb-hrow .wb-hname').last().fill('Cookie');
    await wb.locator('.wb-hrow .wb-hvalue').last().fill('manual=override');
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/tools/request')),
      wb.locator('.wb-send').click()
    ]);
    await page.waitForFunction(() => document.querySelector('#tl-panel-workbench .wb-resp-body').textContent.includes('manual=override'));
    echo = JSON.parse(await bodyText());
    assert.equal(echo.headers.cookie, 'manual=override');

    // 8) history: click restores editor; two checked entries diff headers+body
    assert.ok(await wb.locator('.wb-hist-row').count() >= 3);
    const loginItem = wb.locator('.wb-hist-row .wb-hist-item').nth(2);
    await loginItem.click();
    assert.equal(await wb.locator('.wb-url').inputValue(), 'http://localhost:10002/login');
    assert.equal(await wb.locator('.wb-method').inputValue(), 'POST');
    await wb.locator('.wb-hist-row input[type=checkbox]').nth(0).check();
    await wb.locator('.wb-hist-row input[type=checkbox]').nth(1).check();
    await page.waitForFunction(() => {
      const d = document.querySelector('#tl-panel-workbench .wb-diff');
      return d && !d.hidden;
    });
    const diffText = await wb.locator('.wb-diff').innerText();
    assert.ok(diffText.includes('헤더 비교') && diffText.includes('본문 비교'));
    assert.ok(await wb.locator('.wb-diff-line.wb-diff-add, .wb-diff-line.wb-diff-del').count() > 0,
      'diff should mark added/deleted lines');

    // 9) concurrent send: count=10 -> 10 rows + status aggregate
    await wb.locator('.wb-url').fill(ECHO);
    await wb.locator('.wb-method').selectOption('GET');
    await wb.locator('.wb-count').fill('10');
    await wb.locator('.wb-send').click();
    await page.waitForFunction(() => {
      const box = document.querySelector('#tl-panel-workbench .wb-batch');
      return box && !box.hidden && box.querySelectorAll('tbody tr').length === 10;
    });
    assert.equal(await wb.locator('.wb-batch-table tbody tr').count(), 10);
    assert.match(await wb.locator('.wb-batch-foot').innerText(), /200 ×10/);

    // 9b) inspector tool (W5): local-only computation — zero network requests
    // after mount. All interactions below must not produce any request.
    await page.locator('#tl-inspector').click();
    const insp = page.locator('#tl-panel-inspector');
    await page.waitForFunction(() => document.querySelector('#tl-panel-inspector .in-tabs'));
    const inspectorRequests = [];
    page.on('request', (r) => inspectorRequests.push(r.url()));

    // ① convert: URL encode -> decode round-trip
    const convPanel = insp.locator('.in-panel[data-in-panel="convert"]');
    await convPanel.locator('.in-input').fill('a b&c');
    await convPanel.locator('select').selectOption('url-encode');
    await convPanel.locator('button', { hasText: '변환' }).click();
    assert.equal(await convPanel.locator('.in-result').inputValue(), 'a%20b%26c');
    // copy button must pass the result string — not the textarea element
    await page.evaluate(() => {
      window.__clip = null;
      const fake = { writeText: async (t) => { window.__clip = t; } };
      Object.defineProperty(navigator, 'clipboard', { value: fake, configurable: true });
    });
    await convPanel.locator('button', { hasText: '복사' }).click();
    assert.equal(await page.evaluate(() => window.__clip), 'a%20b%26c',
      'clipboard should receive the result string, not [object HTMLTextAreaElement]');
    await convPanel.locator('.in-input').fill('a%20b%26c');
    await convPanel.locator('select').selectOption('url-decode');
    await convPanel.locator('button', { hasText: '변환' }).click();
    assert.equal(await convPanel.locator('.in-result').inputValue(), 'a b&c');

    // ② JWT: known token -> payload JSON; alg:none keeps trailing dot;
    // HS256 with the known secret reproduces the token exactly.
    const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    await insp.locator('.in-tab[data-in-tab="jwt"]').click();
    const jwtPanel = insp.locator('.in-panel[data-in-panel="jwt"]');
    await jwtPanel.locator('.in-jwt-in').fill(TOKEN);
    await jwtPanel.locator('button', { hasText: '디코딩' }).click();
    assert.ok((await jwtPanel.locator('.in-jwt-payload').inputValue()).includes('"name": "John Doe"'));
    await jwtPanel.locator('.wb-editor select').selectOption('none');
    await jwtPanel.locator('button', { hasText: '토큰 생성' }).click();
    const noneTok = await jwtPanel.locator('.in-jwt-out').inputValue();
    assert.ok(noneTok.endsWith('.'), 'alg:none token keeps the trailing dot');
    await jwtPanel.locator('.wb-editor select').selectOption('hs256');
    await jwtPanel.locator('.in-jwt-secret').fill('your-256-bit-secret');
    await jwtPanel.locator('button', { hasText: '토큰 생성' }).click();
    await page.waitForFunction(() => document.querySelector('#tl-panel-inspector .in-jwt-out').value.length > 0);
    const signed = await jwtPanel.locator('.in-jwt-out').inputValue();
    assert.equal(signed, TOKEN, 'HS256 + known secret must reproduce the token exactly');

    // ③ URL 분해: userinfo confusion -> real host evil.com + warnings
    await insp.locator('.in-tab[data-in-tab="url"]').click();
    const urlPanel = insp.locator('.in-panel[data-in-panel="url"]');
    await urlPanel.locator('.in-url-in').fill('http://localhost:10002@evil.com/');
    await urlPanel.locator('button', { hasText: '분해' }).click();
    assert.equal(await urlPanel.locator('.in-c-host').first().innerText(), 'evil.com');
    const warnText = await urlPanel.locator('.in-warn-list').innerText();
    assert.match(warnText, /userinfo/);
    assert.match(warnText, /@ 앞뒤 혼동/);

    // ④ 경로 해석: decode none/once/twice changes path + escapes badge
    await insp.locator('.in-tab[data-in-tab="path"]').click();
    const pathPanel = insp.locator('.in-panel[data-in-panel="path"]');
    await pathPanel.locator('.in-base').fill('/var/www/files');
    await pathPanel.locator('.in-path-input').fill('%252e%252e%252f..%2fsecret');
    await pathPanel.locator('.in-decode').selectOption('none');
    await pathPanel.locator('button', { hasText: '해석' }).click();
    assert.match(await pathPanel.locator('.in-esc-badge').innerText(), /기준 내부/);
    await pathPanel.locator('.in-decode').selectOption('once');
    await pathPanel.locator('button', { hasText: '해석' }).click();
    assert.match(await pathPanel.locator('.in-esc-badge').innerText(), /기준 내부/);
    const onceText = await pathPanel.locator('.in-url-table').innerText();
    assert.ok(onceText.includes('%2e%2e%2f'), 'once decode should reveal single-encoded segments');
    await pathPanel.locator('.in-decode').selectOption('twice');
    await pathPanel.locator('button', { hasText: '해석' }).click();
    const badge2 = await pathPanel.locator('.in-esc-badge').innerText();
    assert.match(badge2, /탈출/, 'double-decoded traversal must flag escapes');
    const normText = await pathPanel.locator('.in-url-table').innerText();
    assert.ok(normText.includes('decoded') && normText.includes('normalized'));

    // ⑤ zero network requests during all inspector interactions above
    assert.deepEqual(inspectorRequests, [], 'inspector must make zero network requests');

    // 9c) server-log tool (W7): shared log component, all event kinds
    await page.locator('#tl-server-log').click();
    const slog = page.locator('#tl-panel-server-log');
    await page.waitForFunction(() => document.querySelector('#tl-panel-server-log .ql-log'));
    const qlogReqs = [];
    page.on('request', (r) => { if (r.url().includes('/api/lab/querylog')) qlogReqs.push(r.url()); });
    await page.waitForTimeout(800);
    assert.equal(qlogReqs.length, 0, 'closed server-log section must not fetch');

    // seed a file event + an outbound http event on the lab itself
    assert.equal((await fetch('http://localhost:10002/lab/file?name=welcome.txt')).status, 200);
    assert.equal((await fetch(`http://localhost:10002/oracle?url=${encodeURIComponent('http://localhost:8000/lab/internal-note')}`)).status, 200);

    // open + refresh -> file and http-out event cards
    await slog.locator('.ql-log-toggle').click();
    await page.waitForFunction(() => document.querySelectorAll('#tl-panel-server-log .ql-log-card').length > 0);
    const fileCard = slog.locator('.ql-log-card', { hasText: 'welcome.txt' }).first();
    assert.match(await fileCard.innerText(), /파일 열기/);
    assert.match(await fileCard.innerText(), /ok/);
    const outCard = slog.locator('.ql-log-card', { hasText: 'internal-note' }).first();
    assert.match(await outCard.innerText(), /서버가 보낸 요청/);
    assert.match(await outCard.innerText(), /200/);
    await slog.locator('.ql-log-refresh').click();
    assert.ok(qlogReqs.length >= 1, 'open+refresh must fetch');

    // auto refresh: pauses on tab switch, resumes on return, silent when collapsed
    await slog.locator('.ql-log-auto').click();
    let held = qlogReqs.length;
    await page.locator('#tl-workbench').click();
    await page.waitForTimeout(2500);
    assert.equal(qlogReqs.length, held, 'auto refresh must pause while the tool tab is hidden');
    await page.locator('#tl-server-log').click();
    const deadline = Date.now() + 5000;
    while (qlogReqs.length === held && Date.now() < deadline) await page.waitForTimeout(200);
    assert.ok(qlogReqs.length > held, 'auto refresh must resume after returning to the tab');
    await slog.locator('.ql-log-toggle').click(); // collapse
    held = qlogReqs.length;
    await page.waitForTimeout(2500);
    assert.equal(qlogReqs.length, held, 'collapsed section must not fetch even with auto armed');

    // 9d) exploit-server tool (W9): page hosting + callback receiver
    await page.waitForTimeout(2600);
    assert.equal(cbReqs.length, 0, 'no callback polling while the tool tab is hidden');
    await page.locator('#tl-exploit').click();
    const xs = page.locator('#tl-panel-exploit');
    await page.waitForFunction(() => document.querySelector('#tl-panel-exploit .xs-editor'));
    const atkSid = await page.evaluate(() => localStorage.getItem('pnp_attacker_sid'));
    assert.ok(/^[a-zA-Z0-9]{16,64}$/.test(atkSid), 'sid persisted in localStorage');

    // save a page whose script hits the callback URL
    await xs.locator('.xs-name').fill('poc-page');
    await xs.locator('.xs-html').fill(
      `<!doctype html><h1>POC</h1><script>fetch('http://127.0.0.1:10010/cb/${atkSid}/hit?from=page',{method:'POST',body:'p=1'})</script>`);
    await xs.locator('button', { hasText: '페이지 저장' }).click();
    await page.waitForFunction(() => document.querySelectorAll('#tl-panel-exploit .xs-page-row').length >= 1);
    assert.match(await xs.locator('.xs-url').first().inputValue(), new RegExp(`127\\.0\\.0\\.1:10010/p/${atkSid}/`));
    assert.match(await xs.locator('.xs-cb-url').first().inputValue(), new RegExp(`127\\.0\\.0\\.1:10010/cb/${atkSid}/`));

    // open cross-site: new tab renders the stored HTML and fires the callback
    const [pop] = await Promise.all([
      page.context().waitForEvent('page'),
      xs.locator('a', { hasText: 'cross 열기' }).first().click()
    ]);
    await pop.waitForLoadState();
    assert.match(await pop.innerText('body'), /POC/);
    await page.waitForFunction(() => {
      const items = document.querySelectorAll('#tl-panel-exploit .xs-cb-item');
      return [...items].some((i) => i.textContent.includes('/hit?from=page'));
    }, null, { timeout: 8000 });
    assert.match(await xs.locator('.xs-cb-count').innerText(), /[1-9]\d*건 수신/);
    const cbTime = xs.locator('.xs-cb-item .ql-log-time').first();
    assert.match(await cbTime.getAttribute('title'), /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/,
      'callback time title must retain the ISO timestamp');
    assert.doesNotMatch(await cbTime.innerText(), /T\d\d:\d\d:/,
      'callback time should be relative rather than raw ISO');
    const sectionGaps = await xs.locator('.wb-section').evaluateAll((nodes) =>
      nodes.map((n) => parseFloat(getComputedStyle(n).marginTop) + parseFloat(getComputedStyle(n).paddingTop)));
    assert.ok(sectionGaps.length > 0 && sectionGaps.every((gap) => gap >= 12),
      'attacker-server section headings need >=12px space above them');
    await pop.close();

    // polling pauses on tab departure and resumes on return
    let heldCb = cbReqs.length;
    await page.locator('#tl-workbench').click();
    await page.waitForTimeout(2500);
    assert.equal(cbReqs.length, heldCb, 'callback polling must pause while the tool tab is hidden');
    await page.locator('#tl-exploit').click();
    const cbDeadline = Date.now() + 6000;
    while (cbReqs.length === heldCb && Date.now() < cbDeadline) await page.waitForTimeout(200);
    assert.ok(cbReqs.length > heldCb, 'polling must resume after returning to the tab');

    // clear callbacks
    await xs.locator('button', { hasText: '지우기' }).click();
    await page.waitForFunction(() => document.querySelectorAll('#tl-panel-exploit .xs-cb-item').length === 0);
    assert.match(await xs.locator('.xs-cb-count').innerText(), /0건/);

    // prod config hides the tool tab via the existing gate
    await page.route('**/api/config', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ mode: 'prod', tools: { shell: false, attacker: false } })
    }));
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#tl-panel-exploit .xs-editor'));
    assert.equal(await page.locator('#tl-exploit').evaluate((n) => n.hidden), true,
      'tools.attacker=false must hide the exploit tab');
    await page.unroute('**/api/config');

    // Blocked Web Storage falls back to in-memory state without breaking requests.
    await page.locator('#tl-workbench').click();
    await page.evaluate(() => {
      Storage.prototype.getItem = () => { throw new Error('storage blocked'); };
      Storage.prototype.setItem = () => { throw new Error('storage blocked'); };
    });
    await wb.locator('.wb-count').fill('1');
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/tools/request')),
      wb.locator('.wb-send').click()
    ]);
    await page.waitForFunction(() => document.querySelectorAll('#tl-panel-workbench .wb-hist-row').length >= 5);

    // 10) W10 polish checks
    // 10a. concurrent count input is labeled
    const countEl = wb.locator('.wb-count');
    assert.equal(await countEl.getAttribute('aria-label'), '동시 전송 횟수');
    assert.match(await countEl.getAttribute('title'), /동시 전송 횟수/);

    // 10b. preset select shares the method select's styling
    const [preSty, methSty] = await page.evaluate(() => {
      const sty = (sel) => {
        const c = getComputedStyle(document.querySelector(sel));
        return [c.fontFamily, c.padding, c.border];
      };
      return [sty('.wb-presets'), sty('#tl-panel-workbench .wb-method')];
    });
    assert.deepEqual(preSty, methSty, 'preset select must share wb-method styling');

    // 10c. JWT textareas are tall enough to show a four-line header
    await page.locator('#tl-inspector').click();
    await page.locator('#tl-panel-inspector [role="tab"]', { hasText: 'JWT' }).click();
    const jwtHeights = await page.evaluate(() => [
      document.querySelector('#tl-panel-inspector .in-jwt-head').clientHeight,
      document.querySelector('#tl-panel-inspector .in-jwt-payload').clientHeight
    ]);
    assert.ok(jwtHeights.every((h) => h >= 95), `JWT textareas too short: ${jwtHeights}`);

    // 10d. event card head order (time -> kind left, result right) + long-note collapse
    assert.equal((await fetch(`http://localhost:10002/oracle?url=${encodeURIComponent('http://localhost:9999/')}`)).status, 200);
    await page.locator('#tl-server-log').click();
    const slogPanel = page.locator('#tl-panel-server-log');
    await slogPanel.locator('.ql-log-toggle').click();
    await page.waitForFunction(() =>
      [...document.querySelectorAll('#tl-panel-server-log .ql-log-card')]
        .some((c) => c.querySelector('.ql-log-kind') && c.querySelector('.ql-log-err')));
    const cardLayout = await page.evaluate(() => {
      const card = [...document.querySelectorAll('#tl-panel-server-log .ql-log-card')]
        .find((c) => c.querySelector('.ql-log-kind') && c.querySelector('.ql-log-err'));
      const time = card.querySelector('.ql-log-time').getBoundingClientRect();
      const kind = card.querySelector('.ql-log-kind').getBoundingClientRect();
      const badges = card.querySelectorAll('.ql-log-card-head .ql-log-badge');
      const result = badges[badges.length - 1];
      const rr = result.getBoundingClientRect();
      const cardR = card.getBoundingClientRect();
      return {
        order: time.right <= kind.left + 2 && kind.right <= rr.left + 2,
        rightEdge: rr.right <= cardR.right + 1 && rr.right >= cardR.right - 30,
        badgeText: result.textContent,
        fits: result.scrollWidth <= card.clientWidth,
        detailsLabel: card.querySelector('.ql-log-err summary').textContent
      };
    });
    assert.ok(cardLayout.order, 'event card head must be time -> kind (left) -> result (right)');
    assert.ok(cardLayout.rightEdge, 'result badge must sit at the card right edge');
    assert.equal(cardLayout.badgeText, '오류', 'long error note must collapse to a short badge');
    assert.equal(cardLayout.detailsLabel, '자세히');
    assert.ok(cardLayout.fits, 'badge must not overflow the card');

    // 10e. tool-guide maps every W-tool key to its Korean tab name
    await page.addScriptTag({ url: '/tools/tool-guide.js' });
    const guideNames = await page.evaluate(() => {
      const host = document.createElement('div');
      window.pnpTools.mountTool('tool-guide', host, { toolGuide: { steps: [
        { tool: 'request-workbench', label: '권장', when: 'w', how: 'h' },
        { tool: 'inspector', label: '권장', when: 'w', how: 'h' },
        { tool: 'server-log', label: '권장', when: 'w', how: 'h' },
        { tool: 'exploit-server', label: '권장', when: 'w', how: 'h' }
      ] } });
      return [...host.querySelectorAll('.tg-tool')].map((n) => n.textContent);
    });
    assert.deepEqual(guideNames, ['요청 워크벤치', '인스펙터', '서버 로그', '공격자 서버']);

    // 11) sqli-login challenge: the new tool tabs stay hidden
    await page.goto(`${PORTAL}/login.html`);
    await page.fill('#email', 'test@pnp.local');
    await page.fill('#password', 'pnp1234');
    await Promise.all([page.waitForURL('**/home.html'), page.click('#login-form [type=submit], .submit')]);
    await page.goto(`${PORTAL}/challenge.html?id=sqli-login`);
    for (const id of ['#tab-workbench', '#tab-inspector', '#tab-server-log', '#tab-exploit']) {
      assert.equal(await page.locator(id).evaluate((n) => n.hidden), true, `${id} should be hidden on sqli-login`);
    }

    console.log('PASS tools-lab / request-workbench');
  } finally {
    await browser.close();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
