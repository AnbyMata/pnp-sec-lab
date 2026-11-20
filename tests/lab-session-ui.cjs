// Browser lease controls with simulated API/clock; run: node tests/lab-session-ui.cjs
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

(async () => {
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    let state = 'idle', expires = 0, maxExpires = 0, challengeId = null, target = 'python', signedIn = true;
    const now = () => Date.now() / 1000;
    const targets = { python: 'http://python-test.labs.localhost:8000', php: 'http://php-test.labs.localhost:8000', spring: 'http://spring-test.labs.localhost:8000' };
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      const reply = data => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
      if (url.hostname !== 'portal.test') return route.fulfill({ status: url.pathname === '/error' ? 500 : 200, contentType: 'text/html', body: '<h1>실습 사이트</h1>' });
      if (url.pathname === '/api/config') return reply({ managedLabs: true, tools: { shell: true, attacker: false } });
      if (url.pathname === '/api/auth/me') return reply({user:signedIn?{id:'test-user',username:'test',nickname:'테스트'}:null});
      if (url.pathname === '/api/progress') return reply({completedLessons:[],startedLessons:[],solvedChallenges:[]});
      if (url.pathname.startsWith('/api/lab-sessions')) {
        if (url.pathname.endsWith('/start')) { state = 'ready'; expires = now() + 3600; maxExpires = expires + 3600; challengeId = route.request().postDataJSON().challengeId; target = route.request().postDataJSON().target || 'python'; }
        if (url.pathname.endsWith('/extend')) expires = Math.min(expires + 3600, maxExpires);
        if (url.pathname.endsWith('/stop')) state = 'stopped';
        return reply({ state, challengeId, target, expiresAt: expires, maxExpiresAt: maxExpires, serverTime: now(), ...(state === 'ready' ? { targets: { [target]: targets[target] } } : {}) });
      }
      const file = path.join(__dirname, '..', 'new_hub', url.pathname);
      try {
        return route.fulfill({ status: 200, contentType: file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.png') ? 'image/png' : 'text/html', body: fs.readFileSync(file) });
      } catch { return route.fulfill({ status: 404, body: '' }); }
    });
    await page.goto('http://portal.test/login.html');
    await page.evaluate(() => localStorage.setItem('pnp_authenticated', 'true'));
    await page.goto('http://portal.test/challenge.html?id=sqli-login');
    const start = page.locator('[data-session=start]');
    const extend = page.locator('[data-session=extend]');
    await start.waitFor();
    assert.equal(await extend.isDisabled(), true);
    assert.equal(await page.locator('#lab-frame').getAttribute('src'), 'about:blank');
    await start.click();
    await page.waitForFunction(() => document.querySelector('#lab-frame').src.includes('python-test'));
    assert.match(await page.locator('#lab-session time').innerText(), /^0[01]:[0-5]\d:[0-5]\d$/);
    const before = expires;
    await extend.click();
    await page.waitForFunction(() => document.querySelector('[data-session=extend]').disabled);
    assert.equal(expires, before + 3600);
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#lab-frame').src.includes('python-test'));
    assert.equal(expires, before + 3600, 'reload must preserve lease');
    for (const version of ['php', 'spring', 'python']) {
      assert.equal(await page.locator(`[data-target=${version}]`).isHidden(), false);
      await page.locator(`[data-target=${version}]`).click();
      await page.waitForFunction(version => document.querySelector('#lab-frame').src.includes(version + '-test'), version);
      assert.equal(target, version);
      await page.reload();
      await page.waitForFunction(version => document.querySelector('#lab-frame').src.includes(version + '-test'), version);
      assert.equal(await page.locator(`[data-target=${version}]`).getAttribute('aria-pressed'), 'true');
      await page.locator(`[data-target=${version}]`).click();
      assert.match(await page.locator('#lab-frame').getAttribute('src'), new RegExp(version + '-test'));
    }
    await page.locator('#lab-frame').evaluate(frame => { frame.src = 'http://python-test.labs.localhost:8000/error'; });
    await page.locator('#lab-home').click();
    assert.match(await page.locator('#lab-frame').getAttribute('src'), /python-test.*login/);
    await page.goto('http://portal.test/challenge.html?id=ssrf-oracle');
    await page.getByRole('button', {name:'이 문제로 전환'}).waitFor();
    assert.equal(await page.locator('#lab-frame').getAttribute('src'), 'about:blank');
    await page.locator('[data-session=start]').click();
    await page.waitForFunction(() => document.querySelector('#lab-frame').src.endsWith('/oracle'));
    assert.equal(challengeId, 'ssrf-oracle');
    await page.locator('#lab-address').fill('/lab/file?name=../private/note.txt');
    await page.locator('#lab-address').press('Enter');
    assert.match(await page.locator('#lab-frame').getAttribute('src'), /\/lab\/file\?name=\.\.\/private\/note\.txt$/);
    assert.match(await page.locator('.browser-bar a').getAttribute('href'), /name=\.\.\/private\/note\.txt$/);
    await page.locator('#lab-address').fill('https://example.com/');
    await page.locator('#lab-go').click();
    assert.equal(await page.locator('#lab-address-error').isVisible(), true);
    assert.match(await page.locator('#lab-frame').getAttribute('src'), /\/lab\/file\?name=/);
    await page.locator('#lab-home').click();
    assert.match(await page.locator('#lab-address').inputValue(), /\/oracle$/);
    fs.mkdirSync(path.join(__dirname, '..', 'reports'), { recursive: true });
    await page.screenshot({ path: path.join(__dirname, '..', 'reports', 'lab-session.png'), fullPage: true });
    await page.locator('[data-session=stop]').click();
    await page.waitForFunction(() => document.querySelector('#lab-frame').src === 'about:blank');
    assert.equal(await extend.isDisabled(), true);
    // Simulate another tab expiring the lease; the next poll clears stale content.
    await start.click();
    await page.waitForFunction(() => document.querySelector('#lab-frame').src.includes('python-test'));
    state = 'expired'; expires = now() - 1;
    await page.waitForFunction(() => document.querySelector('#lab-frame').src === 'about:blank', null, { timeout: 10000 });
    assert.equal(await extend.isDisabled(), true);
    signedIn=false;
    await page.goto('http://portal.test/challenges.html');
    await page.locator('.card-state').first().click();
    await page.waitForURL('**/challenge.html?id=sqli-login');
    await page.getByRole('button',{name:'로그인 후 실습 시작'}).waitFor();
    assert.equal(await page.locator('#lab-frame').getAttribute('src'),'about:blank');
    await page.getByRole('button',{name:'로그인 후 실습 시작'}).click();
    await page.waitForURL('**/login.html');
    console.log('PASS: session controls, guest challenge viewing, login required for lab start');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
