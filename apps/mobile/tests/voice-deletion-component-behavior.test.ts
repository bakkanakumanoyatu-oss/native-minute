import { chromium, expect as browserExpect, type Browser, type Page, type Route } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type VoiceDeletionState = {
  state: "not_requested" | "processing" | "retry_available" | "manual_required" | "completed" | "already_no_voice";
  phase: "none" | "snapshot" | "completed" | "manual_required";
  canRetry: boolean;
  canAdvance: boolean;
  retryAfterSeconds?: number;
};

type MockResult =
  | { kind: "success"; deletion: VoiceDeletionState }
  | { kind: "invalid" }
  | { kind: "failure"; status: number; body?: unknown }
  | { kind: "network" };

const notRequested: VoiceDeletionState = { state: "not_requested", phase: "none", canRetry: false, canAdvance: false };
const processing: VoiceDeletionState = { state: "processing", phase: "snapshot", canRetry: false, canAdvance: true };
const processingNoAdvance: VoiceDeletionState = { ...processing, canAdvance: false };
const retryAvailable: VoiceDeletionState = { state: "retry_available", phase: "snapshot", canRetry: true, canAdvance: false };
const manualRequired: VoiceDeletionState = { state: "manual_required", phase: "manual_required", canRetry: false, canAdvance: false };
const completed: VoiceDeletionState = { state: "completed", phase: "completed", canRetry: false, canAdvance: false };
const alreadyNoVoice: VoiceDeletionState = { state: "already_no_voice", phase: "none", canRetry: false, canAdvance: false };

let server: ViteDevServer;
let browser: Browser;
let baseUrl: string;

function mobileEnvelope(deletion: VoiceDeletionState) {
  return { ok: true, data: { deletion } };
}

function webEnvelope(deletion: VoiceDeletionState) {
  return { ok: true, data: { deletion } };
}

function invalidEnvelope() {
  return { ok: true, data: { deletion: { state: "unexpected", phase: "none", canRetry: false, canAdvance: false } } };
}

async function fulfillMockResult(route: Route, result: MockResult, mobile: boolean) {
  if (result.kind === "network") {
    await route.abort("failed");
    return;
  }

  if (result.kind === "failure") {
    await route.fulfill({
      status: result.status,
      contentType: "application/json",
      body: JSON.stringify(result.body ?? { ok: false, error: { reasonCode: "request_failed" } })
    });
    return;
  }

  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(result.kind === "invalid" ? invalidEnvelope() : mobile ? mobileEnvelope(result.deletion) : webEnvelope(result.deletion))
  });
}

async function mount(component: "web" | "mobile", setup: (page: Page, calls: string[]) => Promise<void>) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const calls: string[] = [];
  await setup(page, calls);
  await page.goto(`${baseUrl}/tests/voice-deletion-component-harness.html?component=${component}`);
  return { context, page, calls };
}

async function mockWeb(
  page: Page,
  calls: string[],
  responses: { status?: MockResult[]; request?: MockResult[]; advance?: MockResult[] }
) {
  await page.route("**/api/voice-deletion/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    calls.push(`${method} ${path}`);
    const queue = path.endsWith("/status") ? responses.status : path.endsWith("/request") ? responses.request : responses.advance;
    const result = queue?.shift();
    if (!result) {
      throw new Error(`unexpected Web voice deletion request: ${method} ${path}`);
    }
    await fulfillMockResult(route, result, false);
  });
}

async function mockMobile(
  page: Page,
  calls: string[],
  responses: { status?: MockResult[]; request?: MockResult[]; advance?: MockResult[] }
) {
  await page.route("**/api/mobile/voice-deletion/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    calls.push(`${method} ${path}`);
    expect(await route.request().headerValue("authorization")).toBe("Bearer fixture-access-token");
    const queue = path.endsWith("/status") ? responses.status : path.endsWith("/request") ? responses.request : responses.advance;
    const result = queue?.shift();
    if (!result) {
      throw new Error(`unexpected Mobile voice deletion request: ${method} ${path}`);
    }
    await fulfillMockResult(route, result, true);
  });
}

function postCount(calls: string[]) {
  return calls.filter((call) => call.startsWith("POST ") && call.endsWith("/advance")).length;
}

async function expectStablePostCount(page: Page, calls: string[], expected: number) {
  await page.waitForTimeout(100);
  expect(postCount(calls)).toBe(expected);
}

beforeAll(async () => {
  process.env.MOBILE_PROFILE = "development";
  server = await createServer({
    root: new URL("..", import.meta.url).pathname,
    server: { host: "127.0.0.1", port: 0 },
    define: { "process.env": "{}" },
    // Vite's runtime transform accepts this; its optional esbuild type is absent in this workspace.
    esbuild: { jsx: "automatic" } as never,
    appType: "spa"
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") {
    throw new Error("Voice deletion component test server did not expose a TCP address.");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true });
}, 60_000);

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

describe("actual Web VoiceDeletionPanel orchestration", () => {
  it("renders not_requested, confirms and cancels, and starts a request only after confirmation", async () => {
    const { context, page, calls } = await mount("web", (currentPage, currentCalls) =>
      mockWeb(currentPage, currentCalls, {
        status: [
          { kind: "success", deletion: notRequested },
          { kind: "success", deletion: processing },
          { kind: "success", deletion: processing },
          { kind: "success", deletion: processing },
          { kind: "success", deletion: processing }
        ],
        request: [{ kind: "success", deletion: processing }],
        advance: [
          { kind: "success", deletion: processing },
          { kind: "success", deletion: processing },
          { kind: "success", deletion: processing }
        ]
      })
    );

    try {
      await browserExpect(page.getByText("削除を開始する前に、対象と残るデータを確認できます。")).toBeVisible();
      await page.getByRole("button", { name: "クローンボイスを削除する" }).click();
      await browserExpect(page.getByRole("dialog", { name: "クローンボイス削除の確認" })).toBeVisible();
      await page.getByRole("button", { name: "キャンセル" }).click();
      await browserExpect(page.getByRole("dialog", { name: "クローンボイス削除の確認" })).toHaveCount(0);
      expect(calls).toEqual(["GET /api/voice-deletion/status"]);

      await page.getByRole("button", { name: "クローンボイスを削除する" }).click();
      await page.getByRole("dialog", { name: "クローンボイス削除の確認" }).getByRole("button", { name: "クローンボイスを削除する" }).click();
      await browserExpect(page.getByRole("button", { name: "状態を再確認して続ける" })).toBeVisible();
      expect(calls).toEqual([
        "GET /api/voice-deletion/status",
        "POST /api/voice-deletion/request",
        "GET /api/voice-deletion/status",
        "POST /api/voice-deletion/advance",
        "GET /api/voice-deletion/status",
        "POST /api/voice-deletion/advance",
        "GET /api/voice-deletion/status",
        "POST /api/voice-deletion/advance",
        "GET /api/voice-deletion/status"
      ]);
      await expectStablePostCount(page, calls, 3);
    } finally {
      await context.close();
    }
  });

  it("renders processing and bounds a normal batch to exactly three advance POSTs before continuation", async () => {
    const { context, page, calls } = await mount("web", (currentPage, currentCalls) =>
      mockWeb(currentPage, currentCalls, {
        status: [{ kind: "success", deletion: processing }, { kind: "success", deletion: processing }, { kind: "success", deletion: processing }, { kind: "success", deletion: processing }],
        advance: [{ kind: "success", deletion: processing }, { kind: "success", deletion: processing }, { kind: "success", deletion: processing }]
      })
    );

    try {
      await browserExpect(page.getByRole("button", { name: "状態を再確認して続ける" })).toBeVisible();
      expect(calls).toEqual([
        "GET /api/voice-deletion/status",
        "POST /api/voice-deletion/advance",
        "GET /api/voice-deletion/status",
        "POST /api/voice-deletion/advance",
        "GET /api/voice-deletion/status",
        "POST /api/voice-deletion/advance",
        "GET /api/voice-deletion/status"
      ]);
      await expectStablePostCount(page, calls, 3);
    } finally {
      await context.close();
    }
  });

  it("makes continuation GET-first, then starts a fresh three-advance batch", async () => {
    const { context, page, calls } = await mount("web", (currentPage, currentCalls) =>
      mockWeb(currentPage, currentCalls, {
        status: Array.from({ length: 8 }, () => ({ kind: "success" as const, deletion: processing })),
        advance: Array.from({ length: 6 }, () => ({ kind: "success" as const, deletion: processing }))
      })
    );

    try {
      const continuation = page.getByRole("button", { name: "状態を再確認して続ける" });
      await browserExpect(continuation).toBeVisible();
      expect(postCount(calls)).toBe(3);
      await continuation.click();
      await browserExpect.poll(() => postCount(calls)).toBe(6);
      expect(calls).toEqual([
        "GET /api/voice-deletion/status",
        "POST /api/voice-deletion/advance", "GET /api/voice-deletion/status",
        "POST /api/voice-deletion/advance", "GET /api/voice-deletion/status",
        "POST /api/voice-deletion/advance", "GET /api/voice-deletion/status",
        "GET /api/voice-deletion/status",
        "POST /api/voice-deletion/advance", "GET /api/voice-deletion/status",
        "POST /api/voice-deletion/advance", "GET /api/voice-deletion/status",
        "POST /api/voice-deletion/advance", "GET /api/voice-deletion/status"
      ]);
      await expectStablePostCount(page, calls, 6);
    } finally {
      await context.close();
    }
  });

  it("counts retry as POST one and stops after two follow-up advances", async () => {
    const { context, page, calls } = await mount("web", (currentPage, currentCalls) =>
      mockWeb(currentPage, currentCalls, {
        status: [{ kind: "success", deletion: retryAvailable }, { kind: "success", deletion: processing }, { kind: "success", deletion: processing }, { kind: "success", deletion: processing }],
        advance: [{ kind: "success", deletion: processing }, { kind: "success", deletion: processing }, { kind: "success", deletion: processing }]
      })
    );

    try {
      await page.getByRole("button", { name: "削除を再試行する" }).click();
      await browserExpect(page.getByRole("button", { name: "状態を再確認して続ける" })).toBeVisible();
      expect(calls).toEqual([
        "GET /api/voice-deletion/status",
        "POST /api/voice-deletion/advance",
        "GET /api/voice-deletion/status",
        "POST /api/voice-deletion/advance",
        "GET /api/voice-deletion/status",
        "POST /api/voice-deletion/advance",
        "GET /api/voice-deletion/status"
      ]);
      await expectStablePostCount(page, calls, 3);
    } finally {
      await context.close();
    }
  });

  it("uses GET-only recovery after a transport failure and fails safe for invalid responses", async () => {
    const transport = await mount("web", (currentPage, currentCalls) =>
      mockWeb(currentPage, currentCalls, {
        status: Array.from({ length: 6 }, () => ({ kind: "success" as const, deletion: processing })),
        advance: [
          { kind: "network" },
          { kind: "success", deletion: processing },
          { kind: "success", deletion: processing },
          { kind: "success", deletion: processing }
        ]
      })
    );

    try {
      await browserExpect(transport.page.getByText("処理結果を推測しません。状態を再確認してから続けてください。")).toBeVisible();
      await transport.page.getByRole("button", { name: "状態を再確認する" }).click();
      await browserExpect(transport.page.getByRole("button", { name: "状態を再確認して続ける" })).toBeVisible();
      expect(transport.calls).toEqual([
        "GET /api/voice-deletion/status",
        "POST /api/voice-deletion/advance",
        "GET /api/voice-deletion/status"
      ]);
      await expectStablePostCount(transport.page, transport.calls, 1);
      await transport.page.getByRole("button", { name: "状態を再確認して続ける" }).click();
      await browserExpect.poll(() => postCount(transport.calls)).toBe(4);
      expect(transport.calls).toEqual([
        "GET /api/voice-deletion/status",
        "POST /api/voice-deletion/advance",
        "GET /api/voice-deletion/status",
        "GET /api/voice-deletion/status",
        "POST /api/voice-deletion/advance", "GET /api/voice-deletion/status",
        "POST /api/voice-deletion/advance", "GET /api/voice-deletion/status",
        "POST /api/voice-deletion/advance", "GET /api/voice-deletion/status"
      ]);
    } finally {
      await transport.context.close();
    }

    const invalid = await mount("web", (currentPage, currentCalls) =>
      mockWeb(currentPage, currentCalls, { status: [{ kind: "invalid" }] })
    );
    try {
      await browserExpect(invalid.page.getByText("状態を確認できませんでした。通信を確認して、もう一度お試しください。")).toBeVisible();
      expect(postCount(invalid.calls)).toBe(0);
    } finally {
      await invalid.context.close();
    }
  });

  it("never renders destructive retry in manual state and retains both terminal Voice Setup CTAs", async () => {
    const manual = await mount("web", (currentPage, currentCalls) =>
      mockWeb(currentPage, currentCalls, { status: [{ kind: "success", deletion: manualRequired }] })
    );
    try {
      await browserExpect(manual.page.getByRole("link", { name: "Support を開く" })).toBeVisible();
      await browserExpect(manual.page.getByRole("button", { name: "削除を再試行する" })).toHaveCount(0);
      expect(postCount(manual.calls)).toBe(0);
    } finally {
      await manual.context.close();
    }

    const complete = await mount("web", (currentPage, currentCalls) =>
      mockWeb(currentPage, currentCalls, { status: [{ kind: "success", deletion: completed }] })
    );
    try {
      await browserExpect(complete.page.getByRole("link", { name: "Voice Setup を開く" })).toHaveAttribute("href", "/setup/voice");
    } finally {
      await complete.context.close();
    }

    const absent = await mount("web", (currentPage, currentCalls) =>
      mockWeb(currentPage, currentCalls, { status: [{ kind: "success", deletion: alreadyNoVoice }] })
    );
    try {
      await browserExpect(absent.page.getByRole("link", { name: "Voice Setup を始める" })).toHaveAttribute("href", "/setup/voice");
      await browserExpect(absent.page.getByRole("link", { name: "Settings に戻る" })).toHaveAttribute("href", "/settings");
    } finally {
      await absent.context.close();
    }
  });
});

describe("actual Mobile VoiceDeletionScreen orchestration", () => {
  it("restores durable status on initial mount and relaunch, including processing render", async () => {
    const first = await mount("mobile", (currentPage, currentCalls) =>
      mockMobile(currentPage, currentCalls, { status: [{ kind: "success", deletion: processingNoAdvance }] })
    );
    try {
      await browserExpect(first.page.getByText("ボイスデータの削除状況を確認しています。画面を閉じても、次回この画面で状態を確認できます。")).toBeVisible();
      expect(first.calls).toEqual(["GET /api/mobile/voice-deletion/status"]);
      expect(postCount(first.calls)).toBe(0);
    } finally {
      await first.context.close();
    }

    const relaunched = await mount("mobile", (currentPage, currentCalls) =>
      mockMobile(currentPage, currentCalls, { status: [{ kind: "success", deletion: alreadyNoVoice }] })
    );
    try {
      await browserExpect(relaunched.page.getByRole("button", { name: "Voice Setup を始める" })).toBeVisible();
      expect(relaunched.calls).toEqual(["GET /api/mobile/voice-deletion/status"]);
    } finally {
      await relaunched.context.close();
    }
  });

  it("bounds normal mobile batches to three POSTs and makes continuation GET-first", async () => {
    const { context, page, calls } = await mount("mobile", (currentPage, currentCalls) =>
      mockMobile(currentPage, currentCalls, {
        status: Array.from({ length: 8 }, () => ({ kind: "success" as const, deletion: processing })),
        advance: Array.from({ length: 6 }, () => ({ kind: "success" as const, deletion: processing }))
      })
    );
    try {
      const continuation = page.getByRole("button", { name: "状態を再確認して続ける" });
      await browserExpect(continuation).toBeVisible();
      expect(postCount(calls)).toBe(3);
      await continuation.click();
      await browserExpect.poll(() => postCount(calls)).toBe(6);
      expect(calls).toEqual([
        "GET /api/mobile/voice-deletion/status",
        "POST /api/mobile/voice-deletion/advance", "GET /api/mobile/voice-deletion/status",
        "POST /api/mobile/voice-deletion/advance", "GET /api/mobile/voice-deletion/status",
        "POST /api/mobile/voice-deletion/advance", "GET /api/mobile/voice-deletion/status",
        "GET /api/mobile/voice-deletion/status",
        "POST /api/mobile/voice-deletion/advance", "GET /api/mobile/voice-deletion/status",
        "POST /api/mobile/voice-deletion/advance", "GET /api/mobile/voice-deletion/status",
        "POST /api/mobile/voice-deletion/advance", "GET /api/mobile/voice-deletion/status"
      ]);
      await expectStablePostCount(page, calls, 6);
    } finally {
      await context.close();
    }
  });

  it("counts retry as mobile POST one and permits only two follow-up advances", async () => {
    const { context, page, calls } = await mount("mobile", (currentPage, currentCalls) =>
      mockMobile(currentPage, currentCalls, {
        status: [{ kind: "success", deletion: retryAvailable }, { kind: "success", deletion: processing }, { kind: "success", deletion: processing }, { kind: "success", deletion: processing }],
        advance: [{ kind: "success", deletion: processing }, { kind: "success", deletion: processing }, { kind: "success", deletion: processing }]
      })
    );
    try {
      await page.getByRole("button", { name: "削除を再試行する" }).click();
      await browserExpect(page.getByRole("button", { name: "状態を再確認して続ける" })).toBeVisible();
      expect(calls).toEqual([
        "GET /api/mobile/voice-deletion/status",
        "POST /api/mobile/voice-deletion/advance",
        "GET /api/mobile/voice-deletion/status",
        "POST /api/mobile/voice-deletion/advance",
        "GET /api/mobile/voice-deletion/status",
        "POST /api/mobile/voice-deletion/advance",
        "GET /api/mobile/voice-deletion/status"
      ]);
      await expectStablePostCount(page, calls, 3);
    } finally {
      await context.close();
    }
  });

  it("uses safe GET-only recheck for network failure and fail-closes invalid responses", async () => {
    const transport = await mount("mobile", (currentPage, currentCalls) =>
      mockMobile(currentPage, currentCalls, {
        status: Array.from({ length: 6 }, () => ({ kind: "success" as const, deletion: processing })),
        advance: [
          { kind: "network" },
          { kind: "success", deletion: processing },
          { kind: "success", deletion: processing },
          { kind: "success", deletion: processing }
        ]
      })
    );
    try {
      await browserExpect(transport.page.getByText("処理結果を推測しません。状態を再確認してから続けてください。")).toBeVisible();
      await transport.page.getByRole("button", { name: "状態を再確認する" }).click();
      await browserExpect(transport.page.getByRole("button", { name: "状態を再確認して続ける" })).toBeVisible();
      expect(transport.calls).toEqual([
        "GET /api/mobile/voice-deletion/status",
        "POST /api/mobile/voice-deletion/advance",
        "GET /api/mobile/voice-deletion/status"
      ]);
      await expectStablePostCount(transport.page, transport.calls, 1);
      await transport.page.getByRole("button", { name: "状態を再確認して続ける" }).click();
      await browserExpect.poll(() => postCount(transport.calls)).toBe(4);
      expect(transport.calls).toEqual([
        "GET /api/mobile/voice-deletion/status",
        "POST /api/mobile/voice-deletion/advance",
        "GET /api/mobile/voice-deletion/status",
        "GET /api/mobile/voice-deletion/status",
        "POST /api/mobile/voice-deletion/advance", "GET /api/mobile/voice-deletion/status",
        "POST /api/mobile/voice-deletion/advance", "GET /api/mobile/voice-deletion/status",
        "POST /api/mobile/voice-deletion/advance", "GET /api/mobile/voice-deletion/status"
      ]);
    } finally {
      await transport.context.close();
    }

    const invalid = await mount("mobile", (currentPage, currentCalls) =>
      mockMobile(currentPage, currentCalls, { status: [{ kind: "invalid" }] })
    );
    try {
      await browserExpect(invalid.page.getByText("処理を完了できませんでした。少し待ってから再試行してください。")).toBeVisible();
      expect(postCount(invalid.calls)).toBe(0);
    } finally {
      await invalid.context.close();
    }
  });

  it("uses the existing mobile auth refresh before rendering a recovered durable status", async () => {
    const { context, page, calls } = await mount("mobile", (currentPage, currentCalls) =>
      mockMobile(currentPage, currentCalls, {
        status: [
          { kind: "failure", status: 401, body: { ok: false, error: { reasonCode: "session_expired" } } },
          { kind: "success", deletion: processingNoAdvance }
        ]
      })
    );
    try {
      await browserExpect(page.getByText("ボイスデータの削除状況を確認しています。画面を閉じても、次回この画面で状態を確認できます。")).toBeVisible();
      expect(calls).toEqual(["GET /api/mobile/voice-deletion/status", "GET /api/mobile/voice-deletion/status"]);
      await browserExpect(page.locator("body")).toHaveAttribute("data-auth-refreshes", "1");
      await browserExpect(page.locator("body")).toHaveAttribute("data-session-invalidations", "0");
    } finally {
      await context.close();
    }
  });

  it("keeps manual state retry-free and preserves completed, absent, and Settings navigation", async () => {
    const manual = await mount("mobile", (currentPage, currentCalls) =>
      mockMobile(currentPage, currentCalls, { status: [{ kind: "success", deletion: manualRequired }] })
    );
    try {
      await browserExpect(manual.page.getByRole("button", { name: "Support を開く" })).toBeVisible();
      await browserExpect(manual.page.getByRole("button", { name: "削除を再試行する" })).toHaveCount(0);
      await manual.page.getByRole("button", { name: "Settings に戻る" }).click();
      await browserExpect(manual.page.locator("#navigation")).toHaveText('{"name":"settings"}');
      expect(postCount(manual.calls)).toBe(0);
    } finally {
      await manual.context.close();
    }

    const complete = await mount("mobile", (currentPage, currentCalls) =>
      mockMobile(currentPage, currentCalls, { status: [{ kind: "success", deletion: completed }] })
    );
    try {
      await complete.page.getByRole("button", { name: "Voice Setup を開く" }).click();
      await browserExpect(complete.page.locator("#navigation")).toHaveText('{"name":"voice_setup"}');
    } finally {
      await complete.context.close();
    }

    const absent = await mount("mobile", (currentPage, currentCalls) =>
      mockMobile(currentPage, currentCalls, { status: [{ kind: "success", deletion: alreadyNoVoice }] })
    );
    try {
      await absent.page.getByRole("button", { name: "Voice Setup を始める" }).click();
      await browserExpect(absent.page.locator("#navigation")).toHaveText('{"name":"voice_setup"}');
      await absent.page.getByRole("button", { name: "Settings に戻る" }).click();
      await browserExpect(absent.page.locator("#navigation")).toHaveText('{"name":"settings"}');
    } finally {
      await absent.context.close();
    }
  });
});
