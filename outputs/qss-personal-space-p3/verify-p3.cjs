// Real React screens + playback. Synthetic API/native adapters only; NOT an iOS Share Sheet proof.
const {chromium, expect}=require('@playwright/test'); const fs=require('fs');
(async()=>{
 const browser=await chromium.launch();const results=[];
 for(const width of [320,428]) for(const size of [16,32]){
  const page=await browser.newPage({viewport:{width,height:850}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  async function load(path){await page.goto('http://127.0.0.1:5198'+path);await page.evaluate(n=>document.documentElement.style.fontSize=n+'px',size);}
  async function check(name){expect(errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`outputs/qss-personal-space-p3/p3-${name}-${width}-${size}.png`,fullPage:true});results.push({name,width,size,status:'PASS'});}
  async function targets(locator){for(const el of await locator.all()){const b=await el.boundingBox();expect(b.width).toBeGreaterThanOrEqual(44);expect(b.height).toBeGreaterThanOrEqual(44);}}
  await load('/?fixture=populated');await expect(page.locator('.space-recent li').first()).toContainText('録音2件');await targets(page.locator('.space-header button'));await expect(page.getByRole('button',{name:'共有',exact:true})).toHaveCount(0);await check('count-targets');
  await page.locator('.space-own-takes li button').first().click();
  await expect(page.locator('.take-identity h1')).toHaveText('A small pause');await expect(page.locator('.review-kicker')).toHaveText('結果');await targets(page.locator('.practice-focus-header button').first());
  const titleSize=await page.locator('.take-identity h1').evaluate(e=>parseFloat(getComputedStyle(e).fontSize));const kickerSize=await page.locator('.review-kicker').evaluate(e=>parseFloat(getComputedStyle(e).fontSize));expect(titleSize).toBeGreaterThan(kickerSize);
  const snapshot=await page.evaluate(()=>window.p3QA.snapshot());
  await page.getByRole('button',{name:'▶ 自分の録音を再生',exact:true}).click();
  const audio=page.getByLabel('保存済みの自分の録音');await expect(audio).toBeVisible();
  await audio.evaluate(el=>{window.savedAudio=el});await expect.poll(()=>audio.evaluate(el=>el.currentTime)).toBeGreaterThan(0);
  expect(await audio.evaluate(el=>el.duration)).toBeGreaterThan(1);await check('playback');
  await page.evaluate(()=>window.p3QA.outcome='hold');await page.getByRole('button',{name:'共有',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.p3QA.exported.length)).toBe(1);expect(await page.evaluate(()=>window.p3QA.files.length)).toBe(1);expect(await audio.evaluate(el=>el.paused)).toBe(true);
  await page.evaluate(()=>window.p3QA.pending());await expect(page.getByText('共有画面を閉じました。')).toBeVisible();expect(await page.evaluate(()=>window.p3QA.files)).toEqual([]);
  await page.evaluate(()=>window.p3QA.outcome='cancel');await page.getByRole('button',{name:'共有',exact:true}).click();await expect(page.getByText('共有をキャンセルしました。')).toBeVisible();
  expect(await page.evaluate(()=>window.p3QA.snapshot())).toBe(snapshot);expect(await page.evaluate(()=>window.p2QA.calls)).toBe(0);expect(await page.evaluate(()=>window.p3QA.maxFiles)).toBe(1);await check('share-cancel-state');
  await page.getByRole('button',{name:'名前をつける',exact:true}).click();const input=page.getByLabel('録音名（60文字まで）');await input.focus();
  expect(await input.evaluate(el=>getComputedStyle(el).borderTopColor)).toBe('rgb(106, 119, 127)');expect(await input.evaluate(el=>getComputedStyle(el).outlineWidth)).toBe('3px');await check('rename-focus');
  const name='朝の練習 自分のペースで'.repeat(4);await input.fill(name);await page.getByRole('button',{name:'保存',exact:true}).click();await expect(page.locator('.take-identity h1')).toHaveText(name);await expect(page.locator('.take-identity')).toContainText('台本: A small pause');await check('long-recording-name');
  await page.evaluate(()=>window.p3QA.outcome='finish');await page.getByRole('button',{name:'共有',exact:true}).click();await expect(page.getByText('共有画面を閉じました。')).toBeVisible();expect(await page.evaluate(()=>window.p3QA.exported.at(-1))).toContain(name+'.wav');
  await page.getByRole('button',{name:'録音履歴を見る',exact:true}).click();await targets(page.locator('.take-filters button'));await targets(page.locator('.takes-screen > .space-text'));
  expect(await page.evaluate(()=>window.savedAudio.paused && !window.savedAudio.getAttribute('src'))).toBe(true);
  await page.locator('.space-takes li button').first().click();await page.getByRole('button',{name:'共有',exact:true}).click();await expect(page.getByText('共有画面を閉じました。')).toBeVisible();expect(await page.evaluate(()=>window.p3QA.downloads.at(-1))).toBe('preview-latest');await check('my-takes-share');
  await load('/scripts/preview-script/review/preview-latest?fixture=long');await expect(page.locator('.take-identity h1')).toContainText('with colleagues and friends');await check('long-script-title');
  await page.evaluate(()=>window.p3QA.audioMode='missing');await page.getByRole('button',{name:'▶ 自分の録音を再生',exact:true}).click();await expect(page.getByText('この保存済み録音は現在利用できません。')).toBeVisible();await expect(page.getByRole('button',{name:'共有',exact:true})).toBeDisabled();await check('missing-audio');
  await page.evaluate(()=>window.p3QA.audioMode='error');await page.getByRole('button',{name:'録音をもう一度読み込む',exact:true}).click();await expect(page.getByText('録音を再生できませんでした。通信を確認して再試行してください。')).toBeVisible();await check('audio-error');
  await page.getByRole('button',{name:'共有',exact:true}).click();await expect(page.getByText('共有できませんでした。通信を確認して再試行してください。')).toBeVisible();expect(await page.evaluate(()=>window.p3QA.files)).toEqual([]);
  await page.evaluate(()=>window.p3QA.audioMode='success');await page.getByRole('button',{name:'録音をもう一度読み込む',exact:true}).click();await expect(page.getByLabel('保存済みの自分の録音')).toBeVisible();await check('audio-retry');
  await load('/scripts/preview-script/record');await expect(page.getByRole('button',{name:'共有',exact:true})).toHaveCount(0);await check('record-no-share');await page.close();
 }
 await browser.close();fs.writeFileSync('outputs/qss-personal-space-p3/p3-browser-results.json',JSON.stringify(results,null,2));console.log(`${results.length} P3 UI/playback/native-adapter conditions PASS (not device acceptance)`);
})().catch(e=>{console.error(e);process.exit(1)});
