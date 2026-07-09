/** Screenshot the deployed CryptoSage AI site, with patient retries around CoinGecko rate limits. */
const { chromium } = require('playwright');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const base = 'https://haziqbaig.github.io/crypto-ai-assistant/';

  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Dashboard: retry until stat cards appear
  for (let i = 0; i < 8; i++) {
    await sleep(12000);
    const ok = await page.evaluate(() => document.body.innerText.includes('Total Market Cap'));
    if (ok) break;
    console.log('dashboard retry', i + 1);
    await page.evaluate(() => { const b = document.querySelector('#view button'); if (b) b.click(); });
    await sleep(30000);
  }
  await sleep(5000);
  await page.screenshot({ path: '/home/node/.joni/workspace-dario/media/cryptosage-dashboard.png', fullPage: true });
  console.log('dashboard shot done');

  // Coin detail (bitcoin): retry until AI card appears
  await sleep(20000);
  await page.evaluate(() => App.nav('coin', 'bitcoin'));
  for (let i = 0; i < 8; i++) {
    await sleep(12000);
    const ok = await page.evaluate(() => document.body.innerText.includes('CryptoSage AI Recommendation'));
    if (ok) break;
    console.log('detail retry', i + 1);
    await sleep(30000);
    await page.evaluate(() => App.nav('coin', 'bitcoin'));
  }
  await sleep(6000);
  await page.screenshot({ path: '/home/node/.joni/workspace-dario/media/cryptosage-detail.png', fullPage: true });
  console.log('detail shot done');
  await browser.close();
})();
