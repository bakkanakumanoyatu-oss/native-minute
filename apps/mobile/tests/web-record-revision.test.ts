import { chromium, expect as browserExpect } from "@playwright/test";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("Web recording cannot start after leaving during the fresh script check", async () => {
  const result = await build({ stdin: { resolveDir: fileURLToPath(new URL("../../..", import.meta.url)), contents: `
    import React from 'react'; import { createRoot } from 'react-dom/client';
    import { RecordAndEvaluatePanel } from './components/record/record-and-evaluate-panel';
    const qa=window.__webRecordQA={capture:0,release:null};
    window.fetch=()=>new Promise(resolve=>{qa.release=()=>resolve(new Response(JSON.stringify({data:{script:{archivedAt:null,currentRevisionId:'60000000-0000-4000-8000-000000000001',practiceEpoch:1}}})));});
    Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:async()=>{qa.capture++;throw Error('capture must not start');}}});
    window.MediaRecorder=class {};
    const root=createRoot(document.getElementById('root'));qa.leave=()=>root.unmount();
    root.render(<RecordAndEvaluatePanel scriptId="script" expectedRevisionId="60000000-0000-4000-8000-000000000001" expectedPracticeEpoch={1} targetSeconds={60} pronunciationConsentStatus="accepted" transcriptionProvider="mock" transcriptionSupported={true} transcriptionMessage={null} pronunciationProvider="mock" pronunciationSupported={true} pronunciationMessage={null} pronunciationDiagnostics={[]} practiceContext={null}/>);
  `, loader: "tsx" }, bundle: true, write: false, format: "iife", define: { "process.env": "{}" }, jsx: "automatic", plugins: [{ name: "local-router", setup(b) {
    b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "router", namespace: "fixture" }));
    b.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "export const useRouter=()=>({push(){},refresh(){}});" }));
  } }] });
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage(); page.setDefaultTimeout(5000); const errors:string[]=[];
    page.on("pageerror",error=>errors.push(error.message));
    await page.route("**/*",route=>route.fulfill({contentType:route.request().url().endsWith("/app.js")?"text/javascript":"text/html",body:route.request().url().endsWith("/app.js")?result.outputFiles[0].text:'<div id="root"></div><script src="/app.js"></script>'}));
    await page.goto("http://127.0.0.1:5189");
    await page.waitForFunction("document.querySelectorAll('button').length > 0").catch(async error=>{throw Error(JSON.stringify({errors,body:await page.locator('body').innerText()})+String(error));});
    await page.getByRole("button",{name:"マイクで Take を録る",exact:true}).click();
    await browserExpect(page.getByRole("button",{name:"マイクを準備中...",exact:true})).toBeDisabled();
    await page.evaluate("window.__webRecordQA.leave();window.__webRecordQA.release();");
    await page.evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))");
    expect(await page.evaluate("window.__webRecordQA.capture")).toBe(0);
    expect(errors).toEqual([]);
  } finally { await browser.close(); }
}, 20000);
