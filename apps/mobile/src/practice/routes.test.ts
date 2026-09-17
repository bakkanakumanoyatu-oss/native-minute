import { describe, expect, it } from "vitest";
import { isFocusedPractice, practiceBackRoute, safePracticeOrigin, isPracticePath, parsePracticeRoute, practiceRoutePath, type PracticeRoute } from "./routes";

function location(pathname: string, search = "") {
  return { pathname, search } as Location;
}

describe("practice routes", () => {
  it.each<PracticeRoute>([
    { name: "home" },
    { name: "takes" },
    { name: "takes", scriptId: "script-1" },
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
    expect(parsePracticeRoute(location("/scripts/%2F/record"))).toEqual({ name: "home" });
    expect(parsePracticeRoute(location("/unknown"))).toEqual({ name: "home" });
  });

  it("recognizes only paths owned by the authenticated practice shell", () => {
    expect(isPracticePath("/scripts/example/listen")).toBe(true);
    expect(isPracticePath("/setup/voice")).toBe(true);
    expect(isPracticePath("/progress")).toBe(true);
    expect(isPracticePath("/settings")).toBe(true);
    expect(isPracticePath("/settings/account-deletion")).toBe(true);
    expect(isPracticePath("/settings/voice-data")).toBe(true);
    expect(isPracticePath("/login")).toBe(false);
    expect(isPracticePath("/unknown")).toBe(false);
  });
});

describe("focused practice destinations", () => {
  it("uses semantic steps and preserves a validated origin", () => {
    const origin: PracticeRoute = { name: "progress", scriptId: "s1" };
    expect(practiceBackRoute({ name: "record", scriptId: "s1" }, origin)).toEqual({ name: "listen", scriptId: "s1" });
    expect(practiceBackRoute({ name: "review", scriptId: "s1", takeId: "t1" }, origin)).toEqual({ name: "record", scriptId: "s1" });
    expect(practiceBackRoute({ name: "listen", scriptId: "s1" }, origin)).toEqual(origin);
    expect(safePracticeOrigin({ name: "voice_setup" })).toEqual({ name: "home" });
    expect(safePracticeOrigin({ name: "review", scriptId: "s1", takeId: "t1" })).toEqual({ name: "home" });
    expect(isPracticePath("/")).toBe(true);
    expect(isPracticePath("/takes")).toBe(true);
    expect(isFocusedPractice({ name: "record", scriptId: "s1" })).toBe(true);
    expect(isFocusedPractice({ name: "takes" })).toBe(false);
  });
  it("never uses URL-supplied origins and retains direct Record compatibility", () => {
    expect(parsePracticeRoute(location("/scripts/s1/record", "?origin=https://evil.test"))).toEqual({ name: "record", scriptId: "s1" });
    expect(parsePracticeRoute(location("/takes", "?scriptId=%2F%2Fevil.test"))).toEqual({ name: "takes" });
  });
});
