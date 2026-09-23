import { chromium, webkit, expect as check, type Browser, type Page } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// Imports fixture types only; this does not execute the harness in Node.
import type {} from "./script-management-harness";

let server: ViteDevServer;
let baseUrl: string;
beforeAll(async () => {
  server = await createServer({
    configFile: false,
    root: new URL("..", import.meta.url).pathname,
    server: { host: "127.0.0.1", port: 0, fs: { allow: [new URL("../../..", import.meta.url).pathname] } },
    esbuild: { jsx: "automatic" } as never,
    css: { postcss: { plugins: [] } }
  });
  await server.listen();
  const address = server.httpServer!.address();
  if (!address || typeof address === "string") throw new Error("No fixture port");
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
    await page.route("**/*", route => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
    try {
      await page.goto(`${baseUrl}/tests/script-management-harness.html`);
      await check(page.getByRole("button", { name: "編集・削除" }).first()).toBeVisible();
      await run(page);
      expect(errors).toEqual([]);
    } finally { await page.close(); }
  }

  it("brings management and confirmation into view, with one clear archive action", async () => mount(async page => {
    await page.getByRole("button", { name: "編集・削除" }).first().click();
    const heading = page.getByRole("heading", { name: "台本を編集・削除" });
    await check(heading).toBeInViewport();
    expect(await heading.evaluate(element => document.activeElement === element)).toBe(true);

    await page.getByRole("button", { name: "台本を削除" }).click();
    const confirm = page.getByRole("button", { name: "削除する", exact: true });
    await check(confirm).toBeInViewport();
    expect(await confirm.evaluate(element => document.activeElement === element)).toBe(true);
    await check(page.getByRole("button", { name: "台本を削除" })).toHaveCount(0);
    await check(page.getByRole("button", { name: "変更を保存" })).toHaveCount(0);
    await check(confirm).toHaveAccessibleDescription(/録音・評価の履歴は残り、あとで復元できます/);
    await check(page.getByRole("group", { name: "台本削除の確認" })).toContainText("録音・評価の履歴は残り、あとで復元できます");
    await check(page.getByRole("button", { name: "一覧から外す" })).toHaveCount(0);
    await page.getByRole("button", { name: "キャンセル" }).click();
    await check(confirm).toHaveCount(0);
    expect(await page.evaluate(() => window.scriptsQA.mutations)).toEqual([]);
    await page.getByRole("button", { name: "台本を削除" }).click();
    await confirm.click();
    await check(page.getByRole("heading", { name: "台本を編集・削除" })).toHaveCount(0);
    expect(await page.evaluate(() => window.scriptsQA.mutations)).toEqual([
      { scriptId: "script-1", input: { archived: true, expectedLockVersion: 1 } }
    ]);
    expect(await page.evaluate(() => window.scriptsQA.legacyHistory)).toEqual(["take-before-revision"]);
  }));

  it("shows an archive conflict beside the confirmation and allows retry", async () => mount(async page => {
    await page.getByRole("button", { name: "編集・削除" }).first().click();
    await page.getByRole("button", { name: "台本を削除" }).click();
    await page.evaluate(() => window.scriptsQA.failNextMutation());
    const confirmation = page.getByRole("group", { name: "台本削除の確認" });
    await confirmation.getByRole("button", { name: "削除する" }).click();
    const error = confirmation.getByRole("alert");
    await check(error).toBeInViewport();
    await check(confirmation.getByRole("button", { name: "下書きを残して最新状態を確認" })).toBeVisible();
    expect(await page.evaluate(() => window.scriptsQA.mutations)).toEqual([]);
    await confirmation.getByRole("button", { name: "下書きを残して最新状態を確認" }).click();
    await check(error).toHaveCount(0);
    await confirmation.getByRole("button", { name: "削除する" }).click();
    await check(confirmation).toHaveCount(0);
    expect(await page.evaluate(() => window.scriptsQA.mutations)).toEqual([
      { scriptId: "script-1", input: { archived: true, expectedLockVersion: 2 } }
    ]);
  }));

  it("closes the archived list and restores through the archive mutation", async () => mount(async page => {
    const open = page.getByRole("button", { name: "削除済みの台本を見る" });
    await open.click();
    const close = page.getByRole("button", { name: "削除済みの台本を閉じる" });
    await check(close).toHaveAttribute("aria-expanded", "true");
    await check(close).toBeInViewport();
    await check(page.getByRole("button", { name: "Practice 9 — 復元画面を開く" })).toBeVisible();
    await close.click();
    await check(open).toHaveAttribute("aria-expanded", "false");
    await check(page.getByRole("button", { name: "Practice 9 — 復元画面を開く" })).toHaveCount(0);

    await open.click();
    await page.getByRole("button", { name: "Practice 9 — 復元画面を開く" }).click();
    const heading = page.getByRole("heading", { name: "削除済みの台本" });
    await check(heading).toBeInViewport();
    await check(page.getByRole("button", { name: "復元する", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "復元する", exact: true }).click();
    expect(await page.evaluate(() => window.scriptsQA.mutations)).toEqual([
      { scriptId: "script-9", input: { archived: false, expectedLockVersion: 1 } }
    ]);
    expect(await page.evaluate(() => window.scriptsQA.legacyHistory)).toEqual(["take-before-revision"]);
    expect(await page.evaluate(() => window.scriptsQA.activeIds)).toContain("script-9");
  }));
});
