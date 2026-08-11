import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createServerClient = vi.hoisted(() => vi.fn());

vi.mock("@supabase/ssr", () => ({
  createServerClient
}));

vi.mock("@/lib/supabase/config", () => ({
  getSupabaseAnonKey: () => "fixture-anon-key",
  getSupabaseUrl: () => "https://auth.example",
  hasSupabaseConfig: () => true
}));

import { GET } from "../../../app/mobile/auth/callback/route";
import { middleware } from "../../../middleware";

const REPOSITORY_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const CALLBACK_ORIGIN = "https://native-minute-staging.vercel.app";
const CALLBACK_PATH = "/mobile/auth/callback";
const RECOVERY_PATH = "/mobile/auth/recovery";
const RAW_SENTINELS = [
  "authorization-code-must-not-escape",
  "state-must-not-escape",
  "nonce-must-not-escape",
  "transaction-must-not-escape",
  "unexpected-extra-must-not-escape"
];

function callbackUrl(query: string) {
  return `${CALLBACK_ORIGIN}${CALLBACK_PATH}?${query}`;
}

function invokeCallback(url: string) {
  return (GET as unknown as (request: NextRequest) => Response)(new NextRequest(url));
}

describe("Safari mobile auth fallback", () => {
  beforeEach(() => {
    createServerClient.mockReset();
  });

  it.each([
    RAW_SENTINELS.map((value, index) => `${["code", "state", "nonce", "transaction_id", "extra"][index]}=${value}`).join("&"),
    "code=duplicate-one&code=duplicate-two&unexpected=value",
    "malformed=%E0%A4%A&empty="
  ])("moves any callback query to the fixed query-free recovery path", async (query) => {
    const response = invokeCallback(callbackUrl(query));
    const serializedHeaders = JSON.stringify(Object.fromEntries(response.headers));

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(RECOVERY_PATH);
    expect(response.headers.get("location")).not.toContain("?");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-robots-tag")).toContain("noindex");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(await response.text()).toBe("");
    expect(serializedHeaders).not.toContain("com.nativeminutes");

    for (const sentinel of RAW_SENTINELS) {
      expect(serializedHeaders).not.toContain(sentinel);
    }
  });

  it("bypasses Web auth/session middleware for callback and recovery", async () => {
    for (const url of [
      callbackUrl("code=private&state=private&nonce=private&transaction_id=private"),
      `${CALLBACK_ORIGIN}${RECOVERY_PATH}`
    ]) {
      const response = await middleware(new NextRequest(url));

      expect(response.status).toBe(200);
      expect(response.headers.get("x-middleware-next")).toBe("1");
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("set-cookie")).toBeNull();
    }

    expect(createServerClient).not.toHaveBeenCalled();
  });

  it("renders fixed recovery guidance without callback data or an auth transition", () => {
    const pageSource = readFileSync(
      resolve(REPOSITORY_ROOT, "app/mobile/auth/recovery/page.tsx"),
      "utf8"
    );

    expect(pageSource).toContain("このブラウザ画面ではログインを完了せず、セッションも作成しません");
    expect(pageSource).toContain("新しい Magic Link");
    expect(pageSource).toContain("いまブラウザで開いたリンクは再利用しないでください");
    expect(pageSource).not.toContain("com.nativeminutes");
    expect(pageSource).not.toMatch(/<form|href=/);

    for (const sentinel of RAW_SENTINELS) {
      expect(pageSource).not.toContain(sentinel);
    }
  });

  it("contains no application logging, query reader, provider exchange, or Web-session primitive", () => {
    const routeSource = readFileSync(
      resolve(REPOSITORY_ROOT, "app/mobile/auth/callback/route.ts"),
      "utf8"
    );
    const recoverySource = readFileSync(
      resolve(REPOSITORY_ROOT, "app/mobile/auth/recovery/page.tsx"),
      "utf8"
    );
    const middlewareSource = readFileSync(resolve(REPOSITORY_ROOT, "middleware.ts"), "utf8");
    const nextConfigSource = readFileSync(resolve(REPOSITORY_ROOT, "next.config.mjs"), "utf8");
    const fallbackSource = `${routeSource}\n${recoverySource}`;

    expect(fallbackSource).not.toMatch(/searchParams|request\.url|nextUrl|console\.|analytics|telemetry/);
    expect(fallbackSource).not.toMatch(/supabase|exchangeCodeForSession|verifyOtp|cookies\(|Set-Cookie/i);
    expect(fallbackSource).not.toMatch(/com\.nativeminutes|window\.location|location\.href/);
    expect(middlewareSource.indexOf("isMobileAuthFallbackPath(pathname)")).toBeLessThan(
      middlewareSource.indexOf("request.nextUrl.search")
    );
    expect(nextConfigSource).toContain('source: "/mobile/auth/callback"');
    expect(nextConfigSource).toContain('source: "/mobile/auth/recovery"');
    expect(nextConfigSource).toContain('value: "private, no-store, max-age=0"');
    expect(nextConfigSource).toContain('value: "no-referrer"');
  });
});
