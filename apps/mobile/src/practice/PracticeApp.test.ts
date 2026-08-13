import { describe, expect, it, vi } from "vitest";
import {
  MOBILE_ROUTE_TRANSITION_MEASURE,
  recordPracticeRouteTransition
} from "./PracticeApp";

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
