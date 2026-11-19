import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

await mkdir('reports/fastapi-ui', { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
});
const desktop = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
await desktop.goto('http://localhost:8081', { waitUntil: 'networkidle' });
await desktop.screenshot({ path: 'reports/fastapi-ui/home-desktop.png', fullPage: true });
await desktop.goto('http://localhost:8081/board', { waitUntil: 'networkidle' });
await desktop.screenshot({ path: 'reports/fastapi-ui/board-desktop.png', fullPage: true });
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
await mobile.goto('http://localhost:8081', { waitUntil: 'networkidle' });
await mobile.screenshot({ path: 'reports/fastapi-ui/home-mobile.png', fullPage: true });
await browser.close();
