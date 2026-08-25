import { describe, expect, it } from "vitest";
import { isPracticePath, parsePracticeRoute, practiceRoutePath, type PracticeRoute } from "./routes";

function location(pathname: string, search = "") {
  return { pathname, search } as Location;
}

describe("practice routes", () => {
  it.each<PracticeRoute>([
    { name: "scripts" },
    { name: "settings" },
    { name: "account_deletion" },
    { name: "voice_deletion" },
    { name: "voice_setup" },
    { name: "voice_setup", scriptId: "script-1" },
    { name: "listen", scriptId: "script-1" },
    { name: "record", scriptId: "script-1" },
    { name: "review", scriptId: "script-1", takeId: "take-1" },
    { name: "progress" },
    { name: "progress", scriptId: "script-1" }
  ])("round-trips $name without in-memory navigation state", (route) => {
    const path = practiceRoutePath(route);
    const url = new URL(path, "https://mobile.example.test");
    expect(parsePracticeRoute(location(url.pathname, url.search))).toEqual(route);
  });

  it("falls back safely for malformed or unknown paths", () => {
    expect(parsePracticeRoute(location("/scripts/%2F/record"))).toEqual({ name: "scripts" });
    expect(parsePracticeRoute(location("/unknown"))).toEqual({ name: "scripts" });
  });

  it("recognizes only paths owned by the authenticated practice shell", () => {
    expect(isPracticePath("/scripts/example/listen")).toBe(true);
    expect(isPracticePath("/setup/voice")).toBe(true);
    expect(isPracticePath("/progress")).toBe(true);
    expect(isPracticePath("/settings")).toBe(true);
    expect(isPracticePath("/settings/account-deletion")).toBe(true);
    expect(isPracticePath("/settings/voice-data")).toBe(true);
    expect(isPracticePath("/login")).toBe(false);
  });
});
