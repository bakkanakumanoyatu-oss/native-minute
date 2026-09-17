// P1 regression, only P2-authorized Favorite/name/My Takes expectations updated.
const {chromium, expect} = require('@playwright/test');
const fs = require('fs');
(async()=>{
 const browser = await chromium.launch({headless:true}); const results=[];
 for (const width of [320,428]) for(const textSize of [16,32]) {
  const page=await browser.newPage({viewport:{width,height:850}});
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  async function check(name, path, heading) {
   await page.goto('http://127.0.0.1:5192'+path);
   if(heading) await expect(page.getByRole('heading',{name:heading,exact:true})).toBeVisible();
   await page.evaluate(size=>document.documentElement.style.fontSize=size+'px',textSize);
   await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await page.screenshot({path:`outputs/qss-personal-space-p2/${name}-${width}-${textSize}.png`,fullPage:true});
   results.push({name,width,textSize,status:'PASS'});
  }
  await check('first','/?fixture=first','台本から選ぶ');
  await expect(page.locator('.space-counts')).toHaveCount(0);
  await check('error','/?fixture=error','記録を読み込めませんでした');
  await expect(page.locator('.space-counts')).toHaveCount(0);
  await check('home','/?fixture=populated','おかえりなさい。');
  await page.getByRole('button',{name:'練習を続ける'}).click();
  await expect(page.locator('.listen-screen')).toBeVisible();
  await expect(page.locator('.space-bottom-nav')).toHaveCount(0);
  await page.getByRole('button',{name:'練習を終了（Home）',exact:true}).click();
  await expect(page.getByRole('heading',{name:'おかえりなさい。'})).toBeVisible();
  await check('scripts','/scripts','Scripts');
  for (const row of await page.locator('.scripts-row-actions').all()) await expect(row.locator('button')).toHaveCount(1);
  await page.getByRole('button',{name:'A small pauseのお手本を聴いて練習する'}).click();
  await page.getByRole('button',{name:'← 戻る',exact:true}).click();
  await expect(page).toHaveURL(/\/scripts$/);
  await check('takes','/takes','自分の録音');
  await page.locator('.space-takes button').first().click();
  await expect(page.locator('.space-bottom-nav')).toHaveCount(0);
  await page.getByRole('button',{name:'練習を終了（Home）',exact:true}).click();
  await expect(page).toHaveURL('http://127.0.0.1:5192/');
  await check('review','/scripts/preview-script/review/preview-latest','Review');
  await page.getByRole('button',{name:'録音履歴を見る',exact:true}).click();
  await expect(page.locator('.space-bottom-nav')).toBeVisible();
  await page.getByRole('button',{name:'← 戻る',exact:true}).click();
  await expect(page).toHaveURL(/\/review\/preview-latest$/);
  await check('record','/scripts/preview-script/record','Record');
  await expect(page.locator('.space-bottom-nav')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'録音する',exact:true})).toBeVisible();
  const dock=await page.locator('.record-control-dock').boundingBox();
  if(dock.y+dock.height>851) throw Error('Dock outside viewport '+JSON.stringify({width,textSize,dock}));
  await page.locator('.record-script-scroll').evaluate(el=>el.scrollTop=el.scrollHeight);
  const finalVisible=await page.evaluate(()=>{const el=document.querySelector('.record-script-text');const range=document.createRange();range.selectNodeContents(el);range.setStart(el.firstChild,el.textContent.length-5);return range.getBoundingClientRect().bottom <= document.querySelector('.record-script-scroll').getBoundingClientRect().bottom;});
  if(!finalVisible) throw Error('Final line hidden');
  await page.getByRole('button',{name:'← 戻る',exact:true}).click();
  await expect(page).toHaveURL(/\/listen$/);
  await page.getByRole('button',{name:'練習を終了（Home）',exact:true}).click();
  await expect(page).toHaveURL('http://127.0.0.1:5192/');
  await check('listen','/scripts/preview-script/listen','Listen');
  await expect(page.locator('.space-bottom-nav')).toHaveCount(0);
  if(errors.length) throw Error(errors.join('\n'));
  results.push({name:'navigation + direct dock/scroll',width,textSize,status:'PASS'});
  await page.close();
 }
 await browser.close();fs.writeFileSync('outputs/qss-personal-space-p2/verification.json',JSON.stringify(results,null,2));console.log(results.length+' checks PASS');
})().catch(e=>{console.error(e);process.exit(1)});
