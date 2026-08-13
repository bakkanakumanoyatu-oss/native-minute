import { describe, expect, it } from "vitest";
import {
  buildMobileEvaluationInput,
  createStableMobileTakeId
} from "./RecordScreen";

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
      recordingRef: "upload-stable"
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
});
