const {chromium,expect}=require('@playwright/test');
const fs=require('fs');
(async()=>{
 const browser=await chromium.launch();const results=[];
 for(const width of [320,428])for(const size of [16,32]){
  const page=await browser.newPage({viewport:{width,height:850}});
  await page.goto('http://127.0.0.1:5192/scripts/preview-script/review/preview-latest?fixture=one');
  await expect(page.getByRole('button',{name:'名前をつける',exact:true})).toBeVisible();
  await page.evaluate(n=>document.documentElement.style.fontSize=n+'px',size);
  await page.getByRole('button',{name:'名前をつける',exact:true}).click();
  await page.getByLabel('録音名（60文字まで）').fill('This must not become the saved name');
  await page.evaluate(()=>window.p2QA.failUpdate=true);
  await page.getByRole('button',{name:'保存',exact:true}).click();
  await expect(page.getByText('保存を確認できませんでした。',{exact:false})).toBeVisible();
  await expect(page.locator('.take-identity h2')).toHaveCount(0);
  await page.evaluate(()=>window.p2QA.failUpdate=false);
  await page.getByRole('button',{name:'再試行',exact:true}).click();
  await page.evaluate(()=>window.p2QA.deleted=true);
  await page.getByRole('button',{name:'♡ お気に入り',exact:true}).click();
  await expect(page.getByText('対象のデータが見つかりません。',{exact:false})).toBeVisible();
  await expect(page.getByRole('button',{name:'♡ お気に入り',exact:true})).toHaveAttribute('aria-pressed','false');
  results.push({width,size,name:'rename failure / concurrent deletion',status:'PASS'});
  await page.goto('http://127.0.0.1:5192/takes?fixture=error&filter=favorites');
  await expect(page.getByRole('button',{name:'再試行',exact:true})).toBeVisible();
  await expect(page.getByText('お気に入りの録音はまだありません。',{exact:false})).toHaveCount(0);
  results.push({width,size,name:'takes read failure is not empty',status:'PASS'});
  await page.close();
 }
 await browser.close();fs.writeFileSync('outputs/qss-personal-space-p2/error-results.json',JSON.stringify(results,null,2));console.log(results.length+' error conditions PASS');
})().catch(e=>{console.error(e);process.exit(1)});
