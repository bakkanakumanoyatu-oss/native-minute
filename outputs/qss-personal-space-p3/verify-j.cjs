// Synthetic owned audio and Share adapter; real browser playback, not iPhone acceptance.
const { chromium, webkit, expect } = require('@playwright/test');
const fs = require('fs');
(async () => {
  const results = [];
  for (const [engine, launcher] of Object.entries({ chromium, webkit })) {
    const browser = await launcher.launch();
    for (const width of [320, 428]) for (const size of [16, 32]) {
      const page = await browser.newPage({ viewport: { width, height: 850 } });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      const play = page.getByRole('button', { name: '▶ 自分の録音を再生', exact: true });
      const share = page.getByRole('button', { name: '共有', exact: true });
      const audio = page.getByLabel('保存済みの自分の録音');
      async function open() {
        await page.goto('http://127.0.0.1:5198/takes?fixture=populated');
        await page.evaluate(n => document.documentElement.style.fontSize = n + 'px', size);
        await page.locator('.space-takes li button').first().click();
        await expect(play).toBeVisible();
      }
      const geometry = () => share.evaluate(e => ({ x: e.getBoundingClientRect().x, y: e.getBoundingClientRect().y + scrollY }));
      await open();
      const route = page.url();
      const snapshot = await page.evaluate(() => window.p3QA.snapshot());
      await expect(share).toBeEnabled(); await expect(audio).toBeHidden();
      const before = await geometry();
      const playBox = await play.boundingBox(), shareBox = await share.boundingBox();
      expect(shareBox.x - playBox.x - playBox.width).toBeGreaterThanOrEqual(24);
      await page.evaluate(() => window.p3QA.audioDelay = 300);
      await play.click();
      await expect(page.getByText('録音を読み込んでいます…', { exact: true })).toBeVisible();
      await expect.poll(() => audio.evaluate(e => !e.paused && e.currentTime > 0)).toBe(true);
      expect(await page.evaluate(() => window.p3QA.downloads)).toEqual(['preview-latest']);
      const after = await geometry();
      expect(after.x).toBeCloseTo(before.x, 1); expect(after.y).toBeCloseTo(before.y, 1);
      await page.locator('.saved-take-audio').screenshot({ path: `outputs/qss-personal-space-p3/j-${engine}-${width}-${size}.png` });
      await page.evaluate(() => window.p3QA.outcome = 'cancel');
      await share.click(); await expect(page.getByText('共有をキャンセルしました。')).toBeVisible();
      expect(await audio.evaluate(e => e.paused)).toBe(true);
      expect(page.url()).toBe(route);
      expect(await page.evaluate(() => window.p3QA.snapshot())).toBe(snapshot);
      expect(await page.evaluate(() => window.p3QA.files)).toEqual([]);
      expect(await page.evaluate(() => window.p2QA.calls)).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      // Policy rejection keeps the prepared audio and offers a real user-gesture retry.
      await open();
      await audio.evaluate(e => {
        const realPlay = e.play.bind(e); let first = true;
        e.play = () => { if (first) { first = false; return Promise.reject(new DOMException('blocked', 'NotAllowedError')); } return realPlay(); };
      });
      await play.click(); await expect(page.getByText(/再生を開始できませんでした/)).toBeVisible();
      await play.click(); await expect.poll(() => audio.evaluate(e => e.currentTime)).toBeGreaterThan(0);
      expect(await page.evaluate(() => window.p3QA.downloads.length)).toBe(1);
      await expect(page.getByText(/再生を開始できませんでした/)).toHaveCount(0);
      // Share still works before playback, and leaving during fetch cannot start hidden audio.
      await open(); await share.click(); await expect(page.getByText('共有画面を閉じました。')).toBeVisible();
      await expect(audio).toBeHidden();
      await page.evaluate(() => { window.p3QA.audioDelay = 500; window.jPlayEvents = 0; document.addEventListener('play', () => window.jPlayEvents++, true); });
      await play.click(); await page.getByRole('button', { name: '録音履歴を見る', exact: true }).click();
      await page.waitForTimeout(650);
      expect(await page.evaluate(() => window.jPlayEvents)).toBe(0);
      expect(errors).toEqual([]);
      results.push({ engine, width, fontSize: size, result: 'PASS', checks: ['one-tap actual playback after async fetch', '24px gap', 'stable share position', 'cancel retains same Take', 'policy rejection retry', 'share before playback', 'no playback after navigation'] });
      await page.close();
    }
    await browser.close();
  }
  fs.writeFileSync('outputs/qss-personal-space-p3/j-browser-results.json', JSON.stringify(results, null, 2));
  console.log(`${results.length} J browser configurations PASS (not actual-device acceptance)`);
})().catch(error => { console.error(error); process.exit(1); });
