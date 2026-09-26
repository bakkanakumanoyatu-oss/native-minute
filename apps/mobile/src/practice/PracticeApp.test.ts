import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  MOBILE_ROUTE_TRANSITION_MEASURE,
  PracticeApp,
  recordPracticeRouteTransition
} from "./PracticeApp";
import type { PracticeApi } from "./api";

describe("practice brand header", () => {
  it.each(["/", "/settings"])("renders the arrow mark on %s", (pathname) => {
    vi.stubGlobal("window", { location: { pathname, search: "" } });
    try {
      const html = renderToStaticMarkup(createElement(PracticeApp, {
        api: {} as PracticeApi,
        isOnline: true,
        onLogout: () => undefined
      }));

      expect(html).toMatch(/<header class="space-header"><div><img class="brand-mark" src="[^"]*native-minutes-mark-icon[^"]*" alt="Native Minutes"\s*\/>/);
      expect(html).not.toContain("<strong>Native Minutes</strong>");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("practice route timing", () => {
  it("records only a fixed label and duration without route or owner data", () => {
    const sink = {
      clearMeasures: vi.fn(),
      measure: vi.fn()
    } as unknown as Pick<Performance, "clearMeasures" | "measure">;

    expect(recordPracticeRouteTransition(10, 34, sink)).toBe(24);
    expect(sink.clearMeasures).toHaveBeenCalledWith(MOBILE_ROUTE_TRANSITION_MEASURE);
    expect(sink.measure).toHaveBeenCalledWith(MOBILE_ROUTE_TRANSITION_MEASURE, {
      start: 10,
      duration: 24
    });
  });
});
