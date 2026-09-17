const {chromium,expect}=require('@playwright/test');
const fs=require('fs');
(async()=>{
 const browser=await chromium.launch();const results=[];
 for(const width of [320,428])for(const textSize of [16,32]){
  const page=await browser.newPage({viewport:{width,height:850}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const exit=()=>page.getByRole('button',{name:'練習を終了（Home）',exact:true});
  const back=()=>page.getByRole('button',{name:'← 戻る',exact:true});
  for(const screen of ['listen','record','review']){
   // A non-Home origin distinguishes fixed Home exit from the old behavior.
   await page.goto('http://127.0.0.1:5192/'+(screen==='review'?'takes':'scripts')+'?fixture=one');
   await expect(page.locator('.space-bottom-nav')).toBeVisible();
   await page.evaluate(size=>document.documentElement.style.fontSize=size+'px',textSize);
   if(screen==='review')await page.locator('.space-takes button').first().click();
   else {
    await page.locator('.scripts-row-actions button').first().click();
    if(screen==='record'){
     // Use the actual Listen -> Record action (available even before preparation).
     await page.getByRole('button',{name:'録音へ進む',exact:true}).click();
    }
   }
   await expect(page.locator('.'+screen+'-screen')).toBeVisible();
   await expect(exit()).toBeVisible();
   await expect(page.locator('.space-bottom-nav')).toHaveCount(0);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   await page.screenshot({path:`outputs/qss-personal-space-p2/exit-home-${screen}-${width}-${textSize}.png`});
   await exit().click();
   await expect(page).toHaveURL('http://127.0.0.1:5192/');
   await expect(page.locator('.home-screen')).toBeVisible();
   // Direct route Back retains the established previous-step contract.
   const path=screen==='review'?'review/preview-latest':screen;
   await page.goto('http://127.0.0.1:5192/scripts/preview-script/'+path);
   await expect(page.locator('.'+screen+'-screen')).toBeVisible();
   await back().click();
   await expect(page).toHaveURL(screen==='review'?/\/record$/:screen==='record'?/\/listen$/:/5192\/$/);
   results.push({screen,width,textSize,exit:'Home',back:'unchanged',bottomNav:'hidden',status:'PASS'});
  }
  expect(errors).toEqual([]);await page.close();
 }
 await browser.close();fs.writeFileSync('outputs/qss-personal-space-p2/exit-home-results.json',JSON.stringify(results,null,2));console.log(results.length+' direct practice exit regressions PASS');
})().catch(e=>{console.error(e);process.exit(1)});
