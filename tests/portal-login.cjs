const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage();
    const base = 'http://localhost:8000/';
    await page.goto(base);
    await page.locator('.account').waitFor();
    assert.equal(await page.locator('.account').getAttribute('href'), 'login.html');
    await page.locator('.account').click();
    await page.locator('#email').fill('test@pnp.local');
    await page.locator('#password').fill('wrong');
    await page.locator('.submit').click();
    assert.match(await page.locator('#notice').innerText(), /계정 정보/);
    await page.locator('#password').fill('pnp1234');
    await page.locator('.submit').click();
    await page.waitForURL('**/home.html');
    assert.equal(await page.locator('.account').getAttribute('href'), 'mypage.html');
    await page.goto(base + 'challenges.html');
    assert.equal(await page.locator('#guest-notice').isVisible(), false);
    await page.locator('.card-state').first().click();
    await page.waitForURL('**/challenge.html?id=sqli-login');
    await page.locator('#portal-logout').click();
    await page.waitForURL('**/home.html');
    assert.equal(await page.locator('.account').getAttribute('href'), 'login.html');
    await page.goto(base + 'challenges.html');
    assert.equal(await page.locator('#guest-notice').isVisible(), true);
    await page.locator('.card-state').first().click();
    assert.equal(await page.locator('#access-dialog').isVisible(), true);
    console.log('PASS: invalid login, login, account link, banner, challenge access, logout and guest access');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
