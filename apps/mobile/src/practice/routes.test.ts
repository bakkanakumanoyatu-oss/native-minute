import { describe, expect, it } from "vitest";
import { isFocusedPractice, practiceBackRoute, safePracticeOrigin, isPracticePath, parsePracticeRoute, practiceRoutePath, type PracticeRoute, type ReviewReturnOrigin } from "./routes";

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
  const savedReview = { name: "review", scriptId: "s1", takeId: "favorite-take" } as const;

  it.each<PracticeRoute>([
    { name: "home" },
    { name: "takes" },
    { name: "takes", scriptId: "s1", favorites: true },
    { name: "progress" },
    { name: "progress", scriptId: "s1" }
  ])("returns the exact saved Review to its captured $name entry", entry => {
    expect(practiceBackRoute(savedReview, { name: "home" }, null, null, { review: savedReview, origin: entry })).toEqual(entry);
  });

  it.each([
    null,
    { review: { ...savedReview, takeId: "old-take" }, origin: { name: "home" } },
    { review: { ...savedReview, scriptId: "other-script" }, origin: { name: "home" } },
    { review: savedReview, origin: { name: "takes", scriptId: "other-script" } },
    { review: savedReview, origin: { name: "progress", scriptId: "../other" } },
    { review: savedReview, origin: { name: "record", scriptId: "s1" } },
    { review: savedReview, origin: { name: "scripts" } },
    { review: savedReview, origin: { name: "https://evil.test" } },
    { origin: { name: "home" } }
  ])("keeps Review's Record fallback for absent, stale or invalid entry: %j", entry => {
    expect(practiceBackRoute(savedReview, { name: "home" }, null, null, entry as ReviewReturnOrigin | null)).toEqual({ name: "record", scriptId: "s1" });
  });

  it("does not reuse a saved Review entry for a newly evaluated Take or URL origin", () => {
    const nextReview = { ...savedReview, takeId: "new-evaluation" };
    expect(practiceBackRoute(nextReview, { name: "home" }, null, null, { review: savedReview, origin: { name: "home" } })).toEqual({ name: "record", scriptId: "s1" });
    const direct = parsePracticeRoute(location("/scripts/s1/review/favorite-take", "?origin=/&returnTo=/takes"));
    expect(practiceBackRoute(direct, { name: "home" })).toEqual({ name: "record", scriptId: "s1" });
  });

  it("returns Listen to its captured Review and exact Take", () => {
    const review: PracticeRoute = { name: "review", scriptId: "s1", takeId: "original-take" };
    expect(practiceBackRoute({ name: "listen", scriptId: "s1" }, { name: "home" }, null, review)).toEqual(review);
  });

  it.each([
    null,
    { name: "review", scriptId: "stale-script", takeId: "t1" },
    { name: "review", scriptId: "s1", takeId: "https://evil.test" },
    { name: "review", scriptId: "s1", takeId: "../other" },
    { name: "review", scriptId: "s1" },
    { name: "record", scriptId: "s1" },
    { name: "listen", scriptId: "s1" },
    { name: "https://evil.test" }
  ])("keeps the existing Listen fallback for an invalid or stale Review: %j", (entry) => {
    for (const origin of [{ name: "home" }, { name: "scripts" }, { name: "progress", scriptId: "s1" }] as PracticeRoute[]) {
      expect(practiceBackRoute({ name: "listen", scriptId: "s1" }, origin, null, entry as PracticeRoute | null)).toEqual(origin);
    }
  });

  it("ignores URL-supplied Listen origins", () => {
    expect(parsePracticeRoute(location("/scripts/s1/listen", "?origin=/scripts/s1/review/t1&returnTo=https://evil.test"))).toEqual({ name: "listen", scriptId: "s1" });
  });

  it.each<PracticeRoute>([
    { name: "listen", scriptId: "s1" },
    { name: "review", scriptId: "s1", takeId: "original-take" },
    { name: "progress", scriptId: "s1" },
    { name: "progress" },
    { name: "takes", scriptId: "s1", favorites: true }
  ])("returns Record to its captured $name context", (entry) => {
    expect(practiceBackRoute({ name: "record", scriptId: "s1" }, { name: "home" }, entry)).toEqual(entry);
  });

  it.each([
    null,
    { name: "review", scriptId: "stale-script", takeId: "t1" },
    { name: "review", scriptId: "s1", takeId: "https://evil.test" },
    { name: "review", scriptId: "s1" },
    { name: "listen", scriptId: "stale-script" },
    { name: "progress", scriptId: "stale-script" },
    { name: "takes", scriptId: "stale-script" },
    { name: "scripts" },
    { name: "record", scriptId: "s1" },
    { name: "https://evil.test" }
  ])("falls back to same-script Listen for an invalid or stale entry: %j", (entry) => {
    expect(practiceBackRoute({ name: "record", scriptId: "s1" }, { name: "home" }, entry as PracticeRoute | null)).toEqual({ name: "listen", scriptId: "s1" });
  });

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
