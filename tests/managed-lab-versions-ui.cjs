// Dedicated smoke stack on localhost:18766; creates and stops its own environment.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || 'chrome', headless: true });
  const page = await browser.newPage();
  let target = 'php';
  try {
    await page.goto('http://localhost:18766/login.html');
    await page.evaluate(() => localStorage.setItem('pnp_authenticated', 'true'));
    await page.goto('http://localhost:18766/challenge.html?id=sqli-login');
    await page.locator('#lab-session').waitFor();
    await page.locator('[data-target=php]').click();
    await page.locator('[data-session=start]').click();
    const frame = page.frameLocator('#lab-frame');
    await frame.locator('.brand-version').waitFor({ timeout: 200000 });
    assert.match(await frame.locator('.brand-version').innerText(), /php/i);
    assert.equal(await frame.locator('.site-header nav').evaluate(el => new Promise(resolve => { const end = Date.now() + 5000; function check() { const display = getComputedStyle(el).display; if (display === 'flex' || Date.now() > end) resolve(display); else setTimeout(check, 100); } check(); })), 'flex');
    target = 'spring';
    await page.locator('[data-target=spring]').click();
    await page.waitForFunction(() => document.querySelector('#lab-frame').src.includes('spring-'), null, { timeout: 200000 });
    await frame.locator('.brand-version').waitFor({ timeout: 30000 });
    assert.match(await frame.locator('.brand-version').innerText(), /spring/i);
    assert.equal(await frame.locator('.site-header nav').evaluate(el => new Promise(resolve => { const end = Date.now() + 5000; function check() { const display = getComputedStyle(el).display; if (display === 'flex' || Date.now() > end) resolve(display); else setTimeout(check, 100); } check(); })), 'flex');
    const url = await page.locator('#lab-frame').getAttribute('src');
    await page.reload();
    await page.waitForFunction(url => document.querySelector('#lab-frame').src === url, url);
    assert.equal(await page.locator('[data-target=spring]').getAttribute('aria-pressed'), 'true');
    console.log('PASS real browser: PHP iframe, automatic Spring switch, layout, restored selected version');
  } finally {
    await page.request.post('http://localhost:18766/api/lab-sessions/stop', { headers: { Origin: 'http://localhost:18766' }, data: { challengeId: 'sqli-login', target } }).catch(() => {});
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
