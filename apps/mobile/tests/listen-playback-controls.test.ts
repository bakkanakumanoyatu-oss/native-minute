import { chromium, webkit, expect as check, type Browser, type Page } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// Imports window fixture types only; this does not execute the harness in Node.
import type {} from "./listen-playback-harness";

let server: ViteDevServer;
let baseUrl: string;
beforeAll(async () => {
  server = await createServer({ configFile: false, root: new URL("..", import.meta.url).pathname,
    resolve: { alias: [{ find: "../lib/app-lifecycle", replacement: new URL("./listen-lifecycle-fixture.ts", import.meta.url).pathname }] },
    server: { host: "127.0.0.1", port: 0, fs: { allow: [new URL("../../..", import.meta.url).pathname] } },
    esbuild: { jsx: "automatic" } as never, css: { postcss: { plugins: [] } } });
  await server.listen();
  const address = server.httpServer!.address();
  if (!address || typeof address === "string") throw Error("No fixture port");
  baseUrl = `http://127.0.0.1:${address.port}`;
}, 30_000);
afterAll(async () => { await server?.close(); });

for (const [engine, launcher] of Object.entries({ chromium, webkit })) describe(engine, () => {
  let browser: Browser;
  beforeAll(async () => { browser = await launcher.launch(); });
  afterAll(async () => { await browser?.close(); });
  async function mount(run: (page: Page) => Promise<void>) {
    const page = await browser.newPage({ viewport: { width: 428, height: 850 } });
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.setDefaultTimeout(3500);
    await page.route("**/*", route => (new URL(route.request().url()).hostname === "127.0.0.1" || route.request().url().startsWith("blob:" + baseUrl)) ? route.continue() : route.abort());
    try {
      await page.goto(`${baseUrl}/tests/listen-playback-harness.html`);
      await check(page.getByRole("button", { name: "お手本を準備する", exact: true })).toBeEnabled();
      await run(page);
      expect(errors).toEqual([]);
    } catch (error) {
      console.error(engine, errors, await page.locator(".listen-control-dock").innerText().catch(() => "unmounted"), await page.locator("audio").count());
      throw error;
    } finally { await page.close(); }
  }
  const audio = (p: Page) => p.locator("audio");
  const play = (p: Page) => p.getByRole("button", { name: "お手本音声を再生", exact: true });
  const pause = (p: Page) => p.getByRole("button", { name: "お手本音声を一時停止", exact: true });
  async function prepare(p: Page) {
    await p.getByRole("button", { name: "お手本を準備する", exact: true }).click();
    await check.poll(() => audio(p).evaluate(e => (e as HTMLAudioElement).duration)).toBe(36);
  }
  async function suspend(p: Page) {
    await p.evaluate(() => { window.listenQA.native(false); window.listenQA.visibility(true); });
    await check.poll(() => audio(p).getAttribute("src")).toBeNull();
    await p.evaluate(() => { window.listenQA.visibility(false); window.listenQA.native(true); });
  }
  it("uses actual media for seek/pause/rate, clamps both ends and never generates on controls", async () => mount(async p => {
    await prepare(p);
    expect(await audio(p).evaluate(e => (e as HTMLAudioElement).paused)).toBe(true);
    await p.getByRole("button", { name: "お手本音声を5秒戻す" }).click();
    expect(await audio(p).evaluate(e => (e as HTMLAudioElement).currentTime)).toBe(0);
    await p.getByRole("button", { name: "お手本音声を5秒進める" }).click();
    expect(await audio(p).evaluate(e => (e as HTMLAudioElement).currentTime)).toBe(5);
    await p.getByRole("button", { name: "お手本音声を3秒進める" }).click();
    expect(await audio(p).evaluate(e => (e as HTMLAudioElement).currentTime)).toBe(8);
    await p.getByRole("button", { name: "お手本音声を3秒戻す" }).click();
    expect(await audio(p).evaluate(e => (e as HTMLAudioElement).currentTime)).toBe(5);
    expect(await audio(p).evaluate(e => (e as HTMLAudioElement).paused)).toBe(true);
    for (const rate of ["0.75", "0.85", "1", "1.15"]) {
      await p.getByRole("combobox", { name: "お手本音声の再生速度" }).selectOption(rate);
      expect(await audio(p).evaluate(e => (e as HTMLAudioElement).playbackRate)).toBe(Number(rate));
    }
    await play(p).click();
    await check.poll(() => audio(p).evaluate(e => (e as HTMLAudioElement).currentTime)).toBeGreaterThan(5);
    await pause(p).click();
    await p.waitForTimeout(150);
    const time = await audio(p).evaluate(e => (e as HTMLAudioElement).currentTime);
    await p.waitForTimeout(120);
    expect(await audio(p).evaluate(e => (e as HTMLAudioElement).currentTime)).toBe(time);
    for (let i=0;i<8;i++) await p.getByRole("button", { name: "お手本音声を5秒進める" }).click();
    expect(await audio(p).evaluate(e => (e as HTMLAudioElement).currentTime)).toBe(36);
    expect(await audio(p).evaluate(e => (e as HTMLAudioElement).paused)).toBe(true);
    expect(await p.evaluate(() => [window.listenQA.requests.length, window.listenQA.downloads.length])).toEqual([1,1]);
  }));
  it("releases on both lifecycle events, returns paused, then one play re-fetches the exact saved audio at retained time/rate", async () => mount(async p => {
    await prepare(p);
    await p.getByRole("button", { name: "お手本音声を5秒進める" }).click();
    await p.getByRole("combobox").selectOption("0.85");
    await play(p).click(); await check(pause(p)).toBeVisible();
    await p.waitForTimeout(150);
    const time = await audio(p).evaluate(e => (e as HTMLAudioElement).currentTime);
    await suspend(p);
    expect(await audio(p).evaluate(e => (e as HTMLAudioElement).paused)).toBe(true);
    expect(await p.evaluate(() => window.listenQA.revoked.length)).toBe(1);
    await check(p.getByText("再準備する", { exact: true })).toHaveCount(0);
    await p.evaluate(() => { window.listenQA.holdDownload = true; });
    await play(p).click();
    await p.evaluate(() => { window.listenQA.releaseDownload(); });
    await check(pause(p)).toBeVisible();
    await check.poll(() => audio(p).evaluate(e => (e as HTMLAudioElement).currentTime)).toBeGreaterThanOrEqual(time);
    expect(await audio(p).evaluate(e => (e as HTMLAudioElement).playbackRate)).toBe(0.85);
    expect(await p.evaluate(() => window.listenQA.requests.length)).toBe(1);
    expect(await p.evaluate(() => window.listenQA.downloads)).toEqual(["a:script-a:audio", "a:script-a:audio"]);
  }));
  it("expires only the position/rate after 15 minutes without generating or auto-playing", async () => mount(async p => {
    await prepare(p); await p.getByRole("button", { name: "お手本音声を5秒進める" }).click();
    await p.getByRole("combobox").selectOption("0.75"); await suspend(p);
    await p.evaluate(() => { const now = Date.now(); Date.now = () => now + 16 * 60_000; });
    await play(p).click(); await check(pause(p)).toBeVisible();
    expect(await audio(p).evaluate(e => (e as HTMLAudioElement).currentTime)).toBeLessThan(3);
    expect(await audio(p).evaluate(e => (e as HTMLAudioElement).playbackRate)).toBe(1);
    expect(await p.evaluate(() => window.listenQA.requests.length)).toBe(1);
  }));
  for (const kind of ["not-found", "forbidden", "unauthorized"] as const) it(`${kind} clears old identity/time/rate and never falls back to generation`, async () => mount(async p => {
    await prepare(p); await p.getByRole("combobox").selectOption("0.75"); await suspend(p);
    await p.evaluate(kind => { window.listenQA.outcome = { kind, reasonCode: "unavailable" }; }, kind);
    await play(p).click(); await check(p.getByText(/音声は自動で作り直しません/)).toBeVisible();
    await check(play(p)).toHaveCount(0); await check(p.getByRole("combobox")).toHaveCount(0);
    expect(await audio(p).getAttribute("src")).toBeNull();
    expect(await p.evaluate(() => window.listenQA.requests.length)).toBe(1);
  }));
  for (const kind of ["network-error", "timeout", "server-error"] as const) it(`${kind} permits a read-only one-play retry`, async () => mount(async p => {
    await prepare(p); await suspend(p);
    await p.evaluate(kind => { window.listenQA.outcome = kind === "server-error" ? { kind, status: 500 } : { kind }; }, kind);
    await play(p).click(); await check(p.getByText(/音声は自動で作り直しません/)).toBeVisible();
    await p.evaluate(() => { window.listenQA.outcome = null; });
    await play(p).click(); await check(pause(p)).toBeVisible();
    expect(await p.evaluate(() => window.listenQA.requests.length)).toBe(1);
  }));
  it("deduplicates rapid resume and discards a fetch that completes after background", async () => mount(async p => {
    await prepare(p); await suspend(p);
    await p.evaluate(() => { window.listenQA.holdDownload = true; });
    await play(p).evaluate(e => { (e as HTMLButtonElement).click(); (e as HTMLButtonElement).click(); });
    expect(await p.evaluate(() => window.listenQA.downloads.length)).toBe(2);
    await suspend(p); await check(play(p)).toBeDisabled();
    await p.evaluate(() => window.listenQA.releaseDownload());
    await p.waitForTimeout(100);
    expect(await audio(p).getAttribute("src")).toBeNull();
    expect(await p.evaluate(() => window.listenQA.plays)).toBe(0);
    await p.evaluate(() => { window.listenQA.holdDownload = false; });
    await play(p).click(); await check(pause(p)).toBeVisible();
  }));
  for (const change of ["owner", "script", "logout"] as const) it(`${change} discards old async download, media and bookmark`, async () => mount(async p => {
    await prepare(p); await suspend(p);
    await p.evaluate(() => { window.listenQA.holdDownload = true; }); await play(p).click();
    await p.evaluate(change => {
      if (change === "logout") window.listenQA.unmount();
      else window.listenQA.render(change === "owner" ? "b" : "a", change === "script" ? "script-b" : "script-a");
    }, change);
    // root.render is concurrent: release the old fetch only after the new identity commits.
    if (change === "logout") await check(audio(p)).toHaveCount(0);
    else await check(p.getByRole("button", { name: "お手本を準備する", exact: true })).toBeVisible();
    await p.evaluate(() => { window.listenQA.releaseDownload(); window.listenQA.holdDownload = false; });
    await p.waitForTimeout(100);
    expect(await p.evaluate(() => window.listenQA.plays)).toBe(0);
    if (change !== "logout") {
      await prepare(p);
      expect(await audio(p).evaluate(e => [(e as HTMLAudioElement).currentTime, (e as HTMLAudioElement).playbackRate])).toEqual([0,1]);
      expect(await p.evaluate(() => window.listenQA.downloads.at(-1))).toBe(change === "owner" ? "b:script-a:audio" : "a:script-b:audio");
    }
  }));
  it("ignores initial request after unmount without downloading or auto-playing", async () => mount(async p => {
    await p.evaluate(() => { window.listenQA.holdRequest = true; });
    await p.getByRole("button", { name: "お手本を準備する", exact: true }).click();
    await p.evaluate(() => window.listenQA.unmount());
    await check(audio(p)).toHaveCount(0);
    await p.evaluate(() => window.listenQA.releaseRequest()); await p.waitForTimeout(100);
    expect(await p.evaluate(() => window.listenQA.downloads)).toEqual([]);
  }));
  it("play after returning from the end starts again and seek/rate stay connected while playing", async () => mount(async p => {
    await prepare(p);
    for (let i=0;i<8;i++) await p.getByRole("button", { name: "お手本音声を5秒進める" }).click();
    await suspend(p); await play(p).click(); await check(pause(p)).toBeVisible();
    await check.poll(() => audio(p).evaluate(e => (e as HTMLAudioElement).currentTime)).toBeGreaterThan(0);
    expect(await audio(p).evaluate(e => (e as HTMLAudioElement).currentTime)).toBeLessThan(3);
    await p.getByRole("button", { name: "お手本音声を5秒進める" }).click();
    await p.getByRole("combobox").selectOption("1.15");
    expect(await audio(p).evaluate(e => (e as HTMLAudioElement).currentTime)).toBeGreaterThanOrEqual(5);
    expect(await audio(p).evaluate(e => [(e as HTMLAudioElement).paused, (e as HTMLAudioElement).playbackRate])).toEqual([false, 1.15]);
    expect(await p.evaluate(() => window.listenQA.requests.length)).toBe(1);
  }));
  it("unmount during actual playback pauses and detaches the old media", async () => mount(async p => {
    await prepare(p); await play(p).click(); await check(pause(p)).toBeVisible();
    const old = await audio(p).elementHandle();
    await p.evaluate(() => window.listenQA.unmount()); await check(audio(p)).toHaveCount(0);
    await check.poll(() => old!.evaluate(e => [(e as HTMLAudioElement).paused, e.getAttribute("src")])).toEqual([true, null]);
    expect(await p.evaluate(() => window.listenQA.revoked.length)).toBe(1);
  }));
  it("offline return keeps the bookmark and retries via play after reconnection", async () => mount(async p => {
    await prepare(p); await suspend(p);
    await p.evaluate(() => { window.listenQA.online = false; window.listenQA.render(); });
    await play(p).click();
    expect(await p.evaluate(() => window.listenQA.downloads.length)).toBe(1);
    await p.evaluate(() => { window.listenQA.online = true; window.listenQA.render(); });
    await play(p).click(); await check(pause(p)).toBeVisible();
    expect(await p.evaluate(() => window.listenQA.requests.length)).toBe(1);
  }));
  it("decode error and thrown download failure recover without generation", async () => mount(async p => {
    await prepare(p);
    await audio(p).evaluate(e => e.dispatchEvent(new Event("error")));
    await check(p.getByText(/お手本音声を再生できませんでした/)).toBeVisible();
    await p.evaluate(() => { window.listenQA.rejectDownload = true; });
    await play(p).click(); await check(p.getByText(/通信を確認して/)).toBeVisible();
    await p.evaluate(() => { window.listenQA.rejectDownload = false; });
    await play(p).click(); await check(pause(p)).toBeVisible();
    expect(await p.evaluate(() => window.listenQA.requests.length)).toBe(1);
  }));
  it("play policy rejection offers play again without another fetch", async () => mount(async p => {
    await prepare(p);
    await audio(p).evaluate(e => { const a = e as HTMLAudioElement; const real = a.play.bind(a); let first = true; a.play = () => { if (first) { first = false; return Promise.reject(new DOMException("blocked", "NotAllowedError")); } return real(); }; });
    await play(p).click(); await check(p.getByText(/再生を開始できませんでした/)).toBeVisible();
    await play(p).click(); await check(pause(p)).toBeVisible();
    expect(await p.evaluate(() => window.listenQA.downloads.length)).toBe(1);
  }));
  for (const width of [320,428]) for (const fontSize of [16,32]) it(`layout and accessible controls at ${width}px / ${fontSize}px text`, async () => mount(async p => {
    await p.setViewportSize({ width, height: 850 }); await p.evaluate(size => { document.documentElement.style.fontSize = size + "px"; }, fontSize);
    await prepare(p);
    for (const control of [p.getByRole("button", { name: "お手本音声を5秒戻す" }), play(p), p.getByRole("button", { name: "お手本音声を5秒進める" }), p.getByRole("combobox")]) {
      await check(control).toBeVisible(); const box = await control.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44); expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.y + box!.height).toBeLessThanOrEqual(850);
    }
    await p.screenshot({ path: `../../outputs/qss-app-wide-rebaseline-b/listen-${engine}-${width}-${fontSize}.png` });
    expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no horizontal overflow").toBe(true);
    const scroll = p.getByRole("region", { name: "お手本の台本" });
    await scroll.evaluate(e => { e.scrollTop = e.scrollHeight; });
    const visible = await p.locator(".listen-script-text").evaluate(e => {
      const range = document.createRange(); range.selectNodeContents(e); range.setStart(e.firstChild!, e.textContent!.length - 18);
      const rect = range.getBoundingClientRect(); const scroll = e.closest(".listen-script-scroll")!.getBoundingClientRect();
      return rect.top >= scroll.top && rect.bottom <= scroll.bottom;
    });
    await p.screenshot({ path: `../../outputs/qss-app-wide-rebaseline-b/listen-${engine}-${width}-${fontSize}.png` });
    expect(visible, "final line visible").toBe(true);
  }));
});
