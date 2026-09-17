// P1 regression, only P2-authorized Favorite/name/My Takes expectations updated.
const { chromium, expect } = require('@playwright/test');
const fs = require('fs');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  for (const width of [320, 428]) for (const fontSize of [16, 32]) {
    const page = await browser.newPage({ viewport: { width, height: 850 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const fixture of ['first', 'no-result', 'empty', 'first-long', 'one', 'populated', 'long', 'error']) {
      await page.goto(`http://127.0.0.1:5192/?fixture=${fixture}`);
      await page.evaluate(size => document.documentElement.style.fontSize = size + 'px', fontSize);
      if (fixture === 'error') {
        await expect(page.getByRole('heading', { name: '記録を読み込めませんでした' })).toBeVisible();
        await expect(page.locator('.space-counts')).toHaveCount(0);
        await expect(page.getByRole('button', { name: '最初の台本を選ぶ' })).toHaveCount(0);
        await page.getByRole('button', { name: '再試行', exact: true }).click();
        await expect(page.getByRole('heading', { name: '記録を読み込めませんでした' })).toBeVisible();
        await expect(page.locator('.space-counts')).toHaveCount(0);
      } else if (['first', 'no-result', 'empty', 'first-long'].includes(fixture)) {
        await expect(page.getByRole('button', { name: '最初の台本を選ぶ' })).toBeVisible();
        await expect(page.locator('.space-counts')).toHaveCount(0);
        await expect(page.getByText('最初の1分から、', { exact: false })).toHaveCount(0);
        await expect(page.locator('.first-shelf')).toHaveCount(0);
        await expect(page.getByRole('heading', { name: 'Home', exact: true })).toHaveCount(0);
        await expect(page.getByRole('heading', { name: '台本から選ぶ' })).toBeVisible();
        await expect(page.locator('.space-script-preview li')).toHaveCount(fixture === 'first' ? 3 : fixture === 'empty' ? 0 : 1);
        if (fixture !== 'empty') {
          await expect(page.locator('.space-script-preview li').first()).toContainText('目標 60秒');
          await expect(page.locator('.space-script-preview li').first()).toContainText('en-US');
          await expect(page.locator('.space-script-preview li').first().getByRole('button')).toContainText('練習する');
        } else await expect(page.locator('.space-script-preview')).toContainText('まだ台本がありません。');
      } else {
        await expect(page.locator('.space-last .space-script-title')).toBeVisible();
        await expect(page.locator('.space-last')).toContainText('前回 82点');
        await expect(page.locator('.space-last')).toContainText(`同じ台本の最高点 ${fixture === 'one' ? 82 : 86}点`);
        await expect(page.locator('.space-last time')).toHaveAttribute('datetime', '2026-09-17T00:00:00Z');
        await expect(page.locator('.space-recent li')).toHaveCount(fixture === 'populated' ? 3 : fixture === 'long' ? 2 : 1);
        await expect(page.locator('.space-recent li').first()).toContainText('前回 82点');
        await expect(page.locator('.space-recent li').first()).toContainText(fixture === 'one' ? '1 Takes' : '2 Takes');
        await expect(page.locator('.space-counts button').first()).toContainText(`${fixture === 'populated' ? 3 : fixture === 'long' ? 2 : 1}練習した台本`);
        const emphasis = await page.locator('.space-last').evaluate(el => {
          const title = el.querySelector('.space-script-title');
          const score = el.querySelector('.space-result-scores strong');
          return parseFloat(getComputedStyle(title).fontSize) >= parseFloat(getComputedStyle(score).fontSize) && title.getBoundingClientRect().bottom <= score.getBoundingClientRect().top;
        });
        expect(emphasis).toBe(true);
        if (fixture === 'long') {
          const title = page.locator('.space-last .space-script-title');
          await expect(title).toContainText('with colleagues and friends at my own pace');
          expect(await title.evaluate(el => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
        }
        await expect(page.getByRole('heading', { name: 'お気に入りの録音' })).toHaveCount(0);
        await expect(page.getByRole('heading', { name: '自分の録音' })).toBeVisible();
        await expect(page.locator('.space-own-takes li')).toHaveCount(fixture === 'one' ? 1 : 2);
        await expect(page.locator('.space-own-takes li').first()).toContainText(fixture === 'long' ? 'with colleagues and friends at my own pace' : 'A small pause');
        await expect(page.locator('.space-own-takes li').first()).toContainText('スコア 82');
      }
      await expect(page.locator('.home-screen')).not.toContainText('準備中');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: `outputs/qss-personal-space-p2/density-final-${fixture}-${width}-${fontSize}.png`, fullPage: true });
      results.push({ fixture, width, fontSize, status: 'PASS' });
    }
    await page.goto('http://127.0.0.1:5192/takes?fixture=long');
    await expect(page.getByRole('heading', { name: '自分の録音' })).toBeVisible();
    await page.evaluate(size => document.documentElement.style.fontSize = size + 'px', fontSize);
    await expect(page.locator('.space-takes li')).toHaveCount(4);
    for (const row of (await page.locator('.space-takes li').all()).slice(0, 2)) await expect(row).toContainText('with colleagues and friends at my own pace');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `outputs/qss-personal-space-p2/density-final-takes-long-${width}-${fontSize}.png`, fullPage: true });
    results.push({ fixture: 'takes-long-title', width, fontSize, status: 'PASS' });
    await page.goto('http://127.0.0.1:5192/?fixture=first');
    await page.locator('.space-script-preview li').first().getByRole('button').click();
    await expect(page).toHaveURL(/\/scripts\/preview-script\/listen$/);
    await expect(page.locator('.space-bottom-nav')).toHaveCount(0);
    await page.getByRole('button', { name: '練習を終了（Home）', exact: true }).click();
    await expect(page.getByRole('heading', { name: '台本から選ぶ' })).toBeVisible();
    await page.getByRole('button', { name: 'すべて見る →', exact: true }).click();
    await expect(page).toHaveURL(/\/scripts$/);
    await page.goto('http://127.0.0.1:5192/?fixture=populated');
    await page.locator('.space-own-takes li').first().getByRole('button').click();
    await expect(page).toHaveURL(/\/review\/preview-latest$/);
    await page.getByRole('button', { name: '練習を終了（Home）', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'おかえりなさい。' })).toBeVisible();
    await page.getByRole('button', { name: '録音履歴へ →', exact: true }).click();
    await expect(page.getByRole('heading', { name: '自分の録音' })).toBeVisible();
    results.push({ fixture: 'new-preview-navigation', width, fontSize, status: 'PASS' });
    expect(errors).toEqual([]);
    await page.close();
  }
  await browser.close();
  fs.writeFileSync('outputs/qss-personal-space-p2/verification-home-density-final.json', JSON.stringify(results, null, 2));
  console.log(`${results.length} Home density final browser conditions PASS`);
})().catch(error => { console.error(error); process.exit(1); });
