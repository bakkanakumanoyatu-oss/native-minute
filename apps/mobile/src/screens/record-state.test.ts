import { chromium, expect as browserExpect, type Browser, type Page } from "@playwright/test";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  buildMobileEvaluationInput,
  canRetryUploadedMobileEvaluation,
  canSubmitMobileTake,
  createStableMobileTakeId
} from "./RecordScreen";
import type { PracticeRequestFailure } from "../practice/api";

describe("record evaluation retry presentation", () => {
  it.each([
    { kind: "server-error", status: 503 },
    { kind: "timeout" },
    { kind: "network-error" },
    { kind: "rate-limited", retryAfterSeconds: 10 },
    { kind: "invalid-response" }
  ] satisfies PracticeRequestFailure[])("requires a retained upload for $kind", (error) => {
    expect(canRetryUploadedMobileEvaluation(error, false)).toBe(false);
    expect(canRetryUploadedMobileEvaluation(error, true)).toBe(true);
  });

  it.each([
    { kind: "offline" },
    { kind: "unauthorized", reasonCode: "session_expired" },
    { kind: "forbidden", reasonCode: "consent_required" },
    { kind: "not-found", reasonCode: "recording_not_found" },
    { kind: "conflict", reasonCode: "evaluation_in_progress" },
    { kind: "invalid-request", reasonCode: "recording_invalid" },
    { kind: "payload-too-large", reasonCode: "recording_too_large" },
    { kind: "unsupported-media-type", reasonCode: "recording_type_unsupported" }
  ] satisfies PracticeRequestFailure[])("preserves separate recovery for $kind", (error) => {
    expect(canRetryUploadedMobileEvaluation(error, true)).toBe(false);
  });
});

// Exercise the real App -> consent effect -> RecordScreen -> MobileAudioRecorder.
// Only auth, fetch and browser capture are fake; no microphone or external API is used.
describe("active recording remains stoppable across connectivity changes", () => {
  let browser: Browser;
  let bundle: string;
  let css: string;
  const origin = "http://127.0.0.1:5184";
  const unexpected: string[] = [];

  beforeAll(async () => {
    const result = await build({
      stdin: {
        resolveDir: fileURLToPath(new URL("..", import.meta.url)),
        contents: `
          import React from 'react';
          import { createRoot } from 'react-dom/client';
          import { App } from './App';
          import { encodeMonoPcm16Wav } from '../../../lib/browser-pcm-wav';
          const qa = window.__recordQA = {
            captureStarts: 0, trackStops: 0, liveTracks: 0, recorderStarts: 0, uploads: [], evaluations: [],
            consent: 'accepted', consentCalls: 0, evaluationSuccess: false, offline: location.search === '?offline',
            unexpected: []
          };
          Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => !qa.offline });
          const script = { id: 'test-script', title: 'A quiet morning',
            content: Array(16).fill('I take a quiet moment to practice speaking clearly.').join('\\n\\n'),
            locale: 'en-US', targetSeconds: 60, createdAt: '2026-09-05T00:00:00Z', updatedAt: '2026-09-05T00:00:00Z' };
          const ok = data => new Response(JSON.stringify({ok: true, data}), {headers: {'Content-Type': 'application/json'}});
          const review = () => ({ favorite: false, displayName: null, takeId: qa.evaluations[0].takeId, scriptId: script.id, createdAt: script.createdAt, reviewedAt: script.createdAt, transcriptText: 'A quiet morning.',
            evaluation: { score: 82, accuracyScore: 80, fluencyScore: 80, rhythmScore: 80, summaryJa: '結果', strengthsJa: [], weakWords: [], scriptWordCount: 10, transcriptWordCount: 10 },
            coach: { titleJa: '助言', summaryJa: '続けよう', nextStepJa: 'ゆっくり', bulletPointsJa: [], focusWords: [] } });
          window.fetch = async (input, init = {}) => {
            const path = new URL(String(input), location.origin).pathname;
            if (path === '/api/mobile/health') return ok({status: 'ok', service: 'local-test', timestamp: '2026-09-05T00:00:00Z'});
            if (path === '/api/mobile/progress') return ok({progress: {scripts: [], totalScripts: 0, totalReviewedTakes: 0, bestTakeCount: 0}});
            if (path === '/api/mobile/scripts') return ok({scripts: [script]});
            if (path === '/api/mobile/scripts/test-script') return ok({script});
            if (path === '/api/mobile/consents/pronunciation_processing') {
              qa.consentCalls++;
              if (qa.consent === 'pending') return new Promise(() => {});
              if (qa.consent === 'error') return new Response('{}', {status: 503});
              return ok({consent: {status: qa.consent}});
            }
            if (path === '/api/mobile/recordings') {
              const recordingRef = init.body.get('recordingRef');
              qa.uploads.push(recordingRef);
              return ok({recordingRef, durationSeconds: 60, contentType: 'audio/wav'});
            }
            if (path === '/api/mobile/evaluate') {
              qa.evaluations.push(JSON.parse(init.body));
              if (qa.evaluationSuccess) return ok({review: review()});
              return new Response('{}', {status: 503});
            }
            if (path.startsWith('/api/mobile/scripts/test-script/reviews/')) return ok({review: review()});
            qa.unexpected.push(path);
            throw Error('Unexpected mock request');
          };
          Object.defineProperty(navigator, 'mediaDevices', {configurable: true, value: {
            getUserMedia: async () => {
              qa.captureStarts++;
              qa.liveTracks++;
              const track = { enabled: true, readyState: 'live', muted: false,
                stop() {
                  if (this.readyState !== 'ended') { qa.trackStops++; qa.liveTracks--; }
                  this.readyState = 'ended';
                },
                addEventListener() {}, removeEventListener() {} };
              return {getAudioTracks: () => [track], getTracks: () => [track]};
            }
          }});
          window.MediaRecorder = class {
            static isTypeSupported() { return false; }
            mimeType = 'audio/wav'; state = 'inactive';
            start() { this.state = 'recording'; qa.recorderStarts++; }
            stop() {
              this.state = 'inactive';
              const samples = Float32Array.from({length: 16000 * 60}, (_, i) => Math.sin(i / 12) * .12);
              const data = new Blob([encodeMonoPcm16Wav(samples)], {type: 'audio/wav'});
              queueMicrotask(() => { this.ondataavailable?.({data}); this.onstop?.(); });
            }
          };
          const auth = {
            getState: () => ({kind: 'authenticated', userId: 'test-user'}), subscribe: () => () => {},
            start: async () => {}, stop: async () => {}, refresh: async () => ({ok: true}),
            refreshIfNeeded: async () => ({ok: true}), getAccessToken: async () => 'local-test-token',
            signOut: async () => {}, resetLogin: async () => {}
          };
          createRoot(document.getElementById('root')).render(React.createElement(App, {authController: auth}));
        `
      },
      bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
      define: {
        "process.env.NODE_ENV": '"production"', __MOBILE_PROFILE__: '"development"',
        __BFF_BASE_URL__: "window.location.origin", __SUPABASE_URL__: '""',
        __SUPABASE_PUBLISHABLE_KEY__: '""', __AUTH_CALLBACK_URI__: '"com.nativeminutes.app.debug://auth/callback"'
      }
    });
    bundle = result.outputFiles[0].text;
    css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
    browser = await chromium.launch({ headless: true });
  }, 30_000);

  afterEach(async () => {
    for (const context of browser?.contexts() ?? []) await context.close();
    expect(unexpected.splice(0)).toEqual([]);
  });
  afterAll(async () => { await browser?.close(); });

  async function mount(width = 428, fontSize = 16, offline = false) {
    const context = await browser.newContext({ viewport: { width, height: 926 }, serviceWorkers: "block" });
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) {
        unexpected.push(url.origin);
        return route.abort();
      }
      if (url.pathname === "/app.js") return route.fulfill({ contentType: "text/javascript", body: bundle });
      if (url.pathname === "/styles.css") return route.fulfill({ contentType: "text/css", body: css });
      return route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="ja" style="font-size:${fontSize}px"><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'; media-src blob:; base-uri 'none'"><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>` });
    });
    const page = await context.newPage();
    page.on("pageerror", (error) => unexpected.push(error.message));
    page.setDefaultTimeout(5_000);
    await page.goto(`${origin}/scripts/test-script/record${offline ? "?offline" : ""}`);
    await browserExpect(page.getByRole("heading", { name: "Record", exact: true })).toBeVisible();
    return page;
  }

  async function connection(page: Page, online: boolean) {
    await page.evaluate(async (online) => {
      window.__recordQA.offline = !online;
      window.dispatchEvent(new Event(online ? "online" : "offline"));
      await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    }, online);
  }

  const start = (page: Page) => page.getByRole("button", { name: "録音する", exact: true }).click();
  const stop = (page: Page) => page.getByRole("button", { name: "停止", exact: true });
  const cancel = (page: Page) => page.getByRole("button", { name: "この録音を破棄して、録り直す", exact: true });
  const stats = (page: Page) => page.evaluate(() => window.__recordQA);

  it.each([[428, 16], [428, 32], [320, 16], [320, 32]])("keeps stop in its dock and actually stops offline at %i/%i", async (width, fontSize) => {
    const page = await mount(width, fontSize);
    await start(page);
    await browserExpect(stop(page)).toBeVisible();
    const geometry = () => page.evaluate(() => {
      const dock = document.querySelector(".record-control-dock")!;
      const script = document.querySelector(".record-script-scroll")!;
      return { dock: dock.getBoundingClientRect().toJSON(), scrollTop: script.scrollTop,
        text: document.querySelector(".record-script-text")?.textContent };
    });
    await page.locator(".record-script-scroll").evaluate((element) => { element.scrollTop = 180; });
    const before = await geometry();
    await connection(page, false);
    expect(await stop(page).count(), "offline must not remove the stop control").toBe(1);
    await browserExpect(stop(page)).toBeVisible();
    await browserExpect(cancel(page)).toBeVisible();
    expect(await geometry()).toEqual(before);
    expect(await stats(page)).toMatchObject({ captureStarts: 1, recorderStarts: 1, trackStops: 0, liveTracks: 1 });
    const target = await stop(page).boundingBox();
    expect(target!.height).toBeGreaterThanOrEqual(44);
    expect(target!.width).toBeGreaterThanOrEqual(44);
    await page.locator(".record-script-scroll").evaluate((element) => { element.scrollTop = element.scrollHeight; });
    expect(await page.evaluate(() => {
      const text = document.querySelector(".record-script-text")!.firstChild!;
      const range = document.createRange();
      range.setStart(text, (text.textContent?.length ?? 1) - 1); range.setEnd(text, text.textContent!.length);
      return range.getBoundingClientRect().bottom <= document.querySelector(".record-script-scroll")!.getBoundingClientRect().bottom;
    })).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await stop(page).click();
    await browserExpect.poll(async () => (await stats(page)).trackStops, { timeout: 1_500 }).toBe(1);
    expect(await stats(page)).toMatchObject({ liveTracks: 0, uploads: [], evaluations: [], unexpected: [] });
  });

  it("confirms before exiting active capture and keeps recording when declined", async () => {
    const page = await mount(); await start(page);
    page.once("dialog", dialog => dialog.dismiss());
    await page.getByRole("button", { name: "練習を終了（Home）", exact: true }).click();
    await browserExpect(stop(page)).toBeVisible();
    expect(await stats(page)).toMatchObject({ liveTracks: 1, trackStops: 0 });
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "練習を終了（Home）", exact: true }).click();
    await browserExpect(page).toHaveURL(origin + "/");
    expect(await stats(page)).toMatchObject({ liveTracks: 0, trackStops: 1, uploads: [], evaluations: [] });
  });

  it("protects a prepared take on Back and browser history and uses Listen for accepted Back", async () => {
    const page = await mount(); await start(page); await stop(page).click();
    await browserExpect(page.locator("audio")).toHaveCount(1);
    page.once("dialog", dialog => dialog.dismiss());
    await page.getByRole("button", { name: "← 戻る", exact: true }).click();
    await browserExpect(page.locator("audio")).toHaveCount(1);
    await page.evaluate(() => {
      history.pushState(null, "", "/scripts");
      dispatchEvent(new PopStateEvent("popstate"));
    }).then(() => undefined);
    // With no dialog listener, Playwright declines the confirmation automatically.
    await browserExpect(page).toHaveURL(origin + "/scripts/test-script/record");
    await browserExpect(page.locator("audio")).toHaveCount(1);
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "← 戻る", exact: true }).click();
    await browserExpect(page).toHaveURL(origin + "/scripts/test-script/listen");
    expect(await stats(page)).toMatchObject({ uploads: [], evaluations: [] });
  });

  it("opens the saved Review without a discard confirmation after evaluation succeeds", async () => {
    const page = await mount(); await start(page); await stop(page).click();
    await browserExpect(page.locator("audio")).toHaveCount(1);
    await page.getByRole("checkbox").check();
    await page.evaluate(() => { window.__recordQA.evaluationSuccess = true; });
    let dialogs = 0;
    page.on("dialog", dialog => { dialogs++; void dialog.dismiss(); });
    await page.getByRole("button", { name: "この録音で評価する", exact: true }).click();
    await browserExpect(page.getByRole("heading", { name: "Review", exact: true })).toBeVisible();
    expect(dialogs).toBe(0);
    expect((await stats(page)).uploads).toHaveLength(1);
    expect((await stats(page)).evaluations).toHaveLength(1);
  });

  it("cancels offline without waiting for reconnection or preserving a take", async () => {
    const page = await mount(); await start(page); await connection(page, false);
    await cancel(page).click();
    expect(await stats(page)).toMatchObject({ captureStarts: 1, trackStops: 1, liveTracks: 0, uploads: [], evaluations: [] });
    await connection(page, true);
    await browserExpect(page.getByRole("button", { name: "録音する", exact: true })).toBeEnabled();
    await browserExpect(page.locator("audio")).toHaveCount(0);
  });

  it.each(["accepted", "pending", "error", "withdrawn", "required"] as const)("retains the same recording while reconnecting with consent %s", async (consent) => {
    const page = await mount(); await start(page); await connection(page, false);
    const before = await stats(page);
    await page.evaluate((consent) => { window.__recordQA.consent = consent; }, consent);
    await connection(page, true);
    await browserExpect.poll(async () => (await stats(page)).consentCalls, { timeout: 1_500 }).toBeGreaterThan(before.consentCalls);
    await browserExpect(stop(page)).toBeVisible(); await browserExpect(cancel(page)).toBeVisible();
    expect(await stats(page)).toMatchObject({ captureStarts: 1, recorderStarts: 1, trackStops: 0 });
    await stop(page).click();
    await browserExpect.poll(async () => (await stats(page)).trackStops, { timeout: 1_500 }).toBe(1);
    expect(await stats(page)).toMatchObject({ uploads: [], evaluations: [] });
    if (consent !== "accepted") {
      await browserExpect(page.getByRole("button", { name: "録音する", exact: true })).toHaveCount(0);
      await browserExpect(page.getByRole("button", { name: "この録音で評価する", exact: true })).toHaveCount(0);
    }
  });

  it("keeps new recording blocked when initially offline", async () => {
    const page = await mount(428, 16, true);
    await browserExpect(page.locator(".record-control-dock .auth-error")).toBeVisible();
    await browserExpect(page.getByRole("button", { name: "録音する", exact: true })).toHaveCount(0);
    expect(await stats(page)).toMatchObject({ captureStarts: 0, consentCalls: 0, uploads: [], evaluations: [] });
  });

  it("keeps prepared-take and retained-upload gates while offline, with no automatic submission on reconnect", async () => {
    const page = await mount(); await start(page); await stop(page).click();
    const evaluate = page.getByRole("button", { name: "この録音で評価する", exact: true });
    await browserExpect(evaluate).toBeDisabled();
    await page.getByRole("checkbox").check(); await browserExpect(evaluate).toBeEnabled();
    await connection(page, false);
    await browserExpect(evaluate).toHaveCount(0);
    expect(await stats(page)).toMatchObject({ uploads: [], evaluations: [] });
    await connection(page, true); await browserExpect(evaluate).toBeEnabled();
    expect(await stats(page)).toMatchObject({ uploads: [], evaluations: [] });
    await evaluate.click();
    const retry = page.getByRole("button", { name: "同じ録音で評価を再試行", exact: true });
    await browserExpect(retry).toBeEnabled();
    const first = await stats(page);
    await connection(page, false); await browserExpect(retry).toHaveCount(0);
    await connection(page, true); await browserExpect(retry).toBeEnabled();
    expect((await stats(page)).evaluations).toEqual(first.evaluations);
    await retry.click();
    await browserExpect.poll(async () => (await stats(page)).evaluations.length).toBe(2);
    const second = await stats(page);
    expect(second.uploads).toEqual(first.uploads);
    expect(second.evaluations[1]).toEqual(first.evaluations[0]);
  });
});

declare global {
  interface Window {
    __recordQA: {
      offline: boolean;
      evaluationSuccess: boolean;
      consent: "accepted" | "pending" | "error" | "withdrawn" | "required";
      consentCalls: number;
      captureStarts: number;
      recorderStarts: number;
      trackStops: number;
      liveTracks: number;
      uploads: string[];
      evaluations: { scriptId: string; takeId: string; recordingRef: string }[];
      unexpected: string[];
    };
  }
}

describe("record take identity", () => {
  it("creates opaque UUID take identifiers before upload/evaluation retries", () => {
    const first = createStableMobileTakeId();
    const second = createStableMobileTakeId();
    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(second).not.toBe(first);
  });

  it("reuses the exact client take ID and server recording reference on evaluation retry", () => {
    const take = {
      file: new File(["wav"], "take.wav", { type: "audio/wav" }),
      durationSeconds: 42,
      takeId: "take-stable",
      recordingRef: "upload-stable",
      signalClassification: "SIGNAL_PRESENT" as const
    };
    const recording = {
      recordingRef: "recording-owned-ref",
      durationSeconds: 42,
      contentType: "audio/wav"
    };

    const firstAttempt = buildMobileEvaluationInput("script-1", take, recording);
    const retryAttempt = buildMobileEvaluationInput("script-1", take, recording);
    expect(retryAttempt).toEqual(firstAttempt);
    expect(retryAttempt).toMatchObject({
      takeId: "take-stable",
      recordingRef: "recording-owned-ref"
    });
  });

  it("blocks upload/evaluation until a non-silent take has an audible preview confirmation", () => {
    expect(canSubmitMobileTake(null, true)).toBe(false);
    expect(canSubmitMobileTake({ signalClassification: "DIGITAL_SILENCE" }, true)).toBe(false);
    expect(canSubmitMobileTake({ signalClassification: "SIGNAL_PRESENT" }, false)).toBe(false);
    expect(canSubmitMobileTake({ signalClassification: "LOW_SIGNAL" }, false)).toBe(false);
  });

  it("keeps the existing submission path for a confirmed non-silent take", () => {
    expect(canSubmitMobileTake({ signalClassification: "SIGNAL_PRESENT" }, true)).toBe(true);
    expect(canSubmitMobileTake({ signalClassification: "LOW_SIGNAL" }, true)).toBe(true);
  });
});
