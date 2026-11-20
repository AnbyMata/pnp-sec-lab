// E2E: SQLi login-bypass challenge, portal -> Python lab -> /admin flag -> flag submit.
// Run: docker compose up -d, then `node tests/sqli-challenge.cjs`.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');

const PORTAL = 'http://localhost:8000';
const LAB = 'http://localhost:10002';
// MariaDB needs a space after `--`; without it the comment is not recognised.
const PAYLOAD = "admin'-- ";

(async () => {
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    const querylogRequests = [];
    page.on('request', (req) => { if (req.url().includes('/api/lab/querylog')) querylogRequests.push(req.url()); });

    // Portal login is client-side only (localStorage), see new_hub/login.js.
    await page.goto(`${PORTAL}/login.html`);
    await page.fill('#email', 'test@pnp.local');
    await page.fill('#password', 'pnp1234');
    await Promise.all([page.waitForURL('**/home.html'), page.click('#login-form [type=submit], .submit')]);

    await page.goto(`${PORTAL}/challenge.html?id=sqli-login`);
    const frame = page.frameLocator('#lab-frame');
    const labFrame = async () => {
      await page.waitForFunction((u) => [...document.querySelectorAll('iframe')].some((f) => f.src.startsWith(u)), LAB);
      return page.frames().find((f) => f.url().startsWith(LAB));
    };

    // 1. wrong password must fail
    await (await labFrame()).goto(`${LAB}/login`);
    await frame.locator('input[name=user_id]').fill('test');
    await frame.locator('input[name=password]').fill('wrong');
    await frame.locator('button.primary').click();
    await frame.getByText('아이디 또는 비밀번호를 확인해 주세요.').waitFor();

    // 2. normal user is not admin
    await frame.locator('input[name=user_id]').fill('test');
    await frame.locator('input[name=password]').fill('test1234');
    await frame.locator('button.primary').click();
    await frame.getByText('의 방').waitFor();
    await (await labFrame()).goto(`${LAB}/admin`);
    assert.match(await frame.locator('body').innerText(), /관리자 계정으로 로그인해야 합니다/);

    // 3. SQL injection -> admin session
    await (await labFrame()).goto(`${LAB}/logout`);
    await (await labFrame()).goto(`${LAB}/login`);
    await frame.locator('input[name=user_id]').fill(PAYLOAD);
    await frame.locator('input[name=password]').fill('x');
    await frame.locator('button.primary').click();
    await frame.getByText('admin의 방').waitFor();

    // 4. read flag from admin room
    await (await labFrame()).goto(`${LAB}/admin`);
    const flag = (await frame.locator('body').innerText()).match(/PNP\{[^}]+\}/)?.[0];
    assert.ok(flag, 'flag not found on /admin');

    // 5. wrong flag rejected, right flag accepted
    await page.fill('#flag', 'PNP{wrong}');
    await page.click('#flag-form button');
    await page.getByText('플래그가 일치하지 않습니다').waitFor();
    await page.fill('#flag', flag);
    await page.click('#flag-form button');
    await page.getByText('정답입니다').waitFor();
    assert.ok(JSON.parse(await page.evaluate(() => localStorage.getItem('pnp_completed_challenges'))).includes('sqli-login'));

    // 6. query-lab tool: 'admin'-- ' -> comment token, no warning
    await page.click('#tab-query-lab');
    const uidInput = page.locator('#panel-query-lab input[name=user_id]');
    await uidInput.fill("admin'-- ");
    await page.locator('#panel-query-lab .ql-comment').first().waitFor();
    assert.ok(await page.locator('#panel-query-lab .ql-warn').isHidden(), 'unexpected unterminated warning');

    // 'admin'-- (no space) -> '--' is code, quote unterminated -> warning
    await uidInput.fill("admin'--");
    await page.locator('#panel-query-lab .ql-warn').waitFor();
    assert.match(await page.locator('#panel-query-lab .ql-warn').innerText(), /따옴표가 닫히지 않아/);
    assert.equal(await page.locator('#panel-query-lab .ql-comment').count(), 0, 'unexpected comment token');

    // 7. hint disclosures (count follows challenge data: `hints[]` or the single `hint`); theory section has a lesson link
    const hintDetails = page.locator('#hint-list details');
    const hintCount = await hintDetails.count();
    assert.ok(hintCount >= 1, 'expected at least one hint disclosure');
    for (let i = 0; i < hintCount; i += 1) {
      await hintDetails.nth(i).locator('summary').click();
      assert.notEqual(await hintDetails.nth(i).getAttribute('open'), null, `hint ${i + 1} did not open`);
    }
    assert.ok((await hintDetails.locator('p').allInnerTexts()).every((t) => t.trim().length > 0), 'empty hint text');
    assert.equal(await page.locator('.disclosures a[href^="lesson.html"]').count(), 1, 'lesson link missing');

    // 8. terminal tool: visible in dev mode, runs commands via /api/shell
    await page.click('#tab-terminal');
    await page.locator('#panel-terminal input[name=command]').fill('curl -s http://localhost:10002/health');
    await page.locator('#panel-terminal .term-form button[type=submit]').click();
    await page.waitForFunction(() => document.querySelector('#panel-terminal .term-output').textContent.includes('"status":"ok"'));

    // 9. server query log: nothing fetched until 열기; cards show the login SQL
    assert.equal(querylogRequests.length, 0, 'querylog fetched before 열기 click');
    await page.click('#tab-site');
    await (await labFrame()).goto(`${LAB}/login`);
    await frame.locator('input[name=user_id]').fill('test');
    await frame.locator('input[name=password]').fill('test1234');
    await frame.locator('button.primary').click();
    await page.click('#tab-query-lab');
    await page.click('#panel-query-lab .ql-log-toggle');
    await page.waitForFunction(() => [...document.querySelectorAll('#panel-query-lab .ql-log-card')]
      .some((c) => c.textContent.includes("member_modern WHERE user_id='test'")));
    assert.equal(querylogRequests.length, 1, 'expected exactly one querylog request');
    assert.match(querylogRequests[0], /paths=.*limit=/, 'expected a filtered log request');

    // 10. tool tab rule + tool guide + per-challenge terminal chips
    const visibleTabNames = async () =>
      (await page.$$eval('[role="tab"]', (els) => els.filter((e) => !e.hidden).map((e) => e.textContent.trim()))).sort();
    // 10a. login shows exactly site + terminal + tool-guide + query-lab tabs
    assert.deepEqual(await visibleTabNames(), ['도구 안내', '실습 사이트', '쿼리 실험실', '터미널'].sort());

    // 10b. tool guide: 3+ steps with 필수/선택 badges
    await page.click('#tab-tools');
    assert.ok(await page.locator('#panel-tools .tg-step').count() >= 3, 'expected at least 3 guide steps');
    const badgeTexts = await page.locator('#panel-tools .tg-badge').allInnerTexts();
    assert.ok(badgeTexts.some((t) => t.includes('필수')), 'missing 필수 badge');
    assert.ok(badgeTexts.some((t) => t.includes('선택')), 'missing 선택 badge');

    // 10c. login terminal chips: -i login request chip, no time_total chip
    await page.click('#tab-terminal');
    const loginChips = await page.locator('#panel-terminal .term-chip').allInnerTexts();
    assert.ok(loginChips.some((c) => c.includes('-i ')), 'expected an -i chip on login');
    assert.ok(!loginChips.some((c) => c.includes('time_total')), 'unexpected time_total chip on login');

    // 10d. path-traversal (no tools declared): only the 실습 사이트 tab stays visible
    await page.goto(`${PORTAL}/challenge.html?id=path-traversal`);
    assert.deepEqual(await visibleTabNames(), ['실습 사이트']);

    // 11. server query log UI (T15)
    await page.goto(`${PORTAL}/challenge.html?id=sqli-login`);
    // injected login -> logged with a comment token; unterminated quote -> error entry
    await (await labFrame()).goto(`${LAB}/login`);
    await frame.locator('input[name=user_id]').fill(PAYLOAD);
    await frame.locator('input[name=password]').fill('x');
    await frame.locator('button.primary').click();
    await frame.getByText('admin의 방').waitFor(); // injected login redirects to /admin
    await (await labFrame()).goto(`${LAB}/login`);
    await frame.locator('input[name=user_id]').fill("admin'--"); // no space -> 500
    await frame.locator('input[name=password]').fill('x');
    await frame.locator('button.primary').click();

    const requestsBefore = querylogRequests.length;
    await page.click('#tab-query-lab');
    await page.click('#panel-query-lab .ql-log-toggle');

    // 11a (criterion 1): >=1 card whose SQL is the /login query, with a comment token
    await page.waitForFunction(() => document.querySelectorAll('#panel-query-lab .ql-log-card').length >= 1);
    const cards = page.locator('#panel-query-lab .ql-log-card');
    const cardTexts = await cards.allInnerTexts();
    assert.ok(cardTexts.some((t) => t.includes("member_modern WHERE user_id='admin'--")), 'missing the injected login SQL');
    assert.ok(await page.locator('#panel-query-lab .ql-log-card .ql-comment').count() >= 1, 'missing comment token');

    // 11b (criterion 2): refresh shows the 오류 badge and a collapsible details
    await page.click('#panel-query-lab .ql-log-refresh');
    await page.waitForFunction(() => document.querySelector('#panel-query-lab .ql-log-badge-err'));
    assert.ok(await page.locator('#panel-query-lab .ql-log-badge-err').count() >= 1, 'missing 오류 badge');
    assert.ok(await page.locator('#panel-query-lab .ql-log-card details').count() >= 1, 'missing error details');
    const badgeErrTexts = await page.locator('#panel-query-lab .ql-log-badge-err').allInnerTexts();
    assert.ok(badgeErrTexts.every((t) => t.includes('오류')));

    // 11c (criterion 4): a /board request never appears in the sqli-login log
    await page.request.get(`${LAB}/board`);
    await page.click('#panel-query-lab .ql-log-refresh');
    await page.waitForTimeout(300);
    const sqlTexts = await page.locator('#panel-query-lab .ql-log-card .ql-log-sql').allInnerTexts();
    assert.ok(sqlTexts.every((t) => t.includes('member_modern')), 'non-/login query shown in sqli-login log');
    assert.ok(!sqlTexts.some((t) => t.includes('board_modern')), '/board query leaked into sqli-login log');

    // 11d (criterion 3): collapsed log fetches nothing, even with 자동 갱신 armed
    await page.click('#panel-query-lab .ql-log-auto');   // arm auto refresh
    await page.click('#panel-query-lab .ql-log-toggle'); // 접기
    const closedCount = querylogRequests.length;
    await page.waitForTimeout(2500);
    assert.equal(querylogRequests.length, closedCount, 'querylog fetched while collapsed');
    await page.click('#panel-query-lab .ql-log-auto');   // disarm
    assert.ok(querylogRequests.length > requestsBefore, 'no querylog request was observed');

    // 11e (criterion 3 cont.): auto refresh pauses while another tool tab is
    // open (interval cleared) and resumes when the query-lab tab returns
    await page.click('#panel-query-lab .ql-log-toggle'); // open again
    await page.waitForFunction(() => document.querySelectorAll('#panel-query-lab .ql-log-card').length >= 1);
    await page.click('#panel-query-lab .ql-log-auto');   // arm
    await page.click('#tab-site');                       // hide the tool tab
    const awayCount = querylogRequests.length;
    await page.waitForTimeout(2500);
    assert.equal(querylogRequests.length, awayCount, 'querylog fetched while tool tab hidden');
    await page.click('#tab-query-lab');                  // visible again -> auto resumes
    for (let i = 0; i < 40 && querylogRequests.length === awayCount; i += 1) await page.waitForTimeout(100);
    assert.ok(querylogRequests.length > awayCount, 'auto refresh did not resume on tab return');
    await page.click('#panel-query-lab .ql-log-auto');   // disarm

    // 11f: refresh button carries aria-busy only while the request is in
    // flight — hold the response via route interception, no fixed sleeps
    const heldRoutes = [];
    await page.route('**/api/lab/querylog*', (route) => heldRoutes.push(route));
    await page.click('#panel-query-lab .ql-log-refresh');
    for (let i = 0; i < 50 && heldRoutes.length === 0; i += 1) await page.waitForTimeout(50);
    await page.waitForFunction(() =>
      document.querySelector('#panel-query-lab .ql-log-refresh').getAttribute('aria-busy') === 'true');
    for (const route of heldRoutes) await route.continue().catch(() => {});
    await page.unroute('**/api/lab/querylog*');
    await page.waitForFunction(() =>
      !document.querySelector('#panel-query-lab .ql-log-refresh').hasAttribute('aria-busy'));

    console.log('PASS sqli-login challenge');
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
