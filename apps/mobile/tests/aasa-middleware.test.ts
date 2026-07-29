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

import { middleware } from "../../../middleware";

const AASA_URL =
  "https://native-minute-staging.vercel.app/.well-known/apple-app-site-association";

describe("AASA middleware safety", () => {
  beforeEach(() => {
    createServerClient.mockReset();
  });

  it("passes the exact AASA path without auth, redirect, or cookies", async () => {
    const response = await middleware(new NextRequest(AASA_URL));

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(createServerClient).not.toHaveBeenCalled();
  });
});
