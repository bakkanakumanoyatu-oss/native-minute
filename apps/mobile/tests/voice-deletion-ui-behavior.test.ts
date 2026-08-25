import { describe, expect, it } from "vitest";
import {
  MAX_VOICE_DELETION_ADVANCES,
  canRetryVoiceDeletion,
  canStartVoiceDeletionBatch,
  getVoiceDeletionTerminalActions,
  needsVoiceDeletionContinuation,
  nextVoiceDeletionConfirmationState,
  recheckVoiceDeletionStatus,
  retainedVoiceDeletionDataCopy,
  runVoiceDeletionAdvanceBatch
} from "@/components/voice/voice-deletion-controller";
import {
  mobileVoiceDeletionStatusCopy,
  navigateToVoiceSetupAfterDeletion
} from "../src/screens/VoiceDeletionScreen";

type SafeStatus = {
  state: "not_requested" | "processing" | "retry_available" | "manual_required" | "completed" | "already_no_voice";
  canAdvance: boolean;
  canRetry: boolean;
};

const processing: SafeStatus = { state: "processing", canAdvance: true, canRetry: false };
const completed: SafeStatus = { state: "completed", canAdvance: false, canRetry: false };

describe("Web voice-deletion UI controller behavior", () => {
  it("keeps not-requested and manual states non-destructive until their explicit UI actions", () => {
    expect(canStartVoiceDeletionBatch({ state: "not_requested", canAdvance: false })).toBe(false);
    expect(canStartVoiceDeletionBatch({ state: "manual_required", canAdvance: false })).toBe(false);
    expect(nextVoiceDeletionConfirmationState("open")).toBe(true);
    expect(nextVoiceDeletionConfirmationState("cancel")).toBe(false);
  });

  it("runs at most three POST advances and offers continuation without treating processing as failure", async () => {
    const calls: string[] = [];
    const result = await runVoiceDeletionAdvanceBatch({
      advance: async () => {
        calls.push("POST");
        return processing;
      },
      getStatus: async () => {
        calls.push("GET");
        return processing;
      }
    });

    expect(result).toEqual({ kind: "status", deletion: processing, advances: 3, needsContinuation: true });
    expect(calls).toEqual(["POST", "GET", "POST", "GET", "POST", "GET"]);
    expect(needsVoiceDeletionContinuation(processing, 0)).toBe(true);
  });

  it("rechecks with GET first, then permits a fresh bounded processing batch", async () => {
    const calls: string[] = [];
    const rechecked = await recheckVoiceDeletionStatus(async () => {
      calls.push("GET");
      return processing;
    });
    expect(rechecked).toBe(processing);
    expect(calls).toEqual(["GET"]);

    const nextBatch = await runVoiceDeletionAdvanceBatch({
      advance: async () => {
        calls.push("POST");
        return processing;
      },
      getStatus: async () => {
        calls.push("GET");
        return completed;
      }
    });
    expect(nextBatch).toEqual({ kind: "status", deletion: completed, advances: 1, needsContinuation: false });
    expect(calls).toEqual(["GET", "POST", "GET"]);
  });

  it("does not infer a durable result after an advance or status transport failure", async () => {
    const failedAdvance = await runVoiceDeletionAdvanceBatch({
      advance: async () => null as SafeStatus | null,
      getStatus: async () => processing
    });
    const failedStatus = await runVoiceDeletionAdvanceBatch({
      advance: async () => processing,
      getStatus: async () => null as SafeStatus | null
    });
    expect(failedAdvance).toEqual({ kind: "transport_failure", advances: 1 });
    expect(failedStatus).toEqual({ kind: "transport_failure", advances: 1 });
  });

  it("keeps retry unavailable until a read-only recheck reports canRetry", async () => {
    const waiting: SafeStatus = { state: "retry_available", canAdvance: false, canRetry: false };
    const ready: SafeStatus = { ...waiting, canRetry: true };
    expect(canRetryVoiceDeletion(waiting)).toBe(false);
    expect(await recheckVoiceDeletionStatus(async () => ready)).toBe(ready);
    expect(canRetryVoiceDeletion(ready)).toBe(true);
  });

  it("keeps the confirmation's retained learning data and terminal Voice Setup CTAs explicit", () => {
    expect(retainedVoiceDeletionDataCopy).toContain("コーチフィードバック");
    expect(retainedVoiceDeletionDataCopy).toContain("最新・ベスト結果");
    expect(getVoiceDeletionTerminalActions("completed")).toEqual({ primary: "Voice Setup を開く", secondary: null });
    expect(getVoiceDeletionTerminalActions("already_no_voice")).toEqual({ primary: "Voice Setup を始める", secondary: "Settings に戻る" });
  });
});

describe("Mobile voice-deletion UI controller behavior", () => {
  it("uses the same three-advance bound after a relaunch status restore", async () => {
    const calls: string[] = ["mount GET"];
    const restored = await recheckVoiceDeletionStatus(async () => processing);
    expect(restored).toBe(processing);
    const batch = await runVoiceDeletionAdvanceBatch({
      maximumAdvances: MAX_VOICE_DELETION_ADVANCES,
      advance: async () => {
        calls.push("POST");
        return processing;
      },
      getStatus: async () => {
        calls.push("GET");
        return processing;
      }
    });
    expect(batch).toMatchObject({ kind: "status", needsContinuation: true });
    expect(calls.filter((call) => call === "POST")).toHaveLength(3);
  });

  it("keeps terminal copy and Voice Setup navigation distinct from account deletion", () => {
    const onNavigate = (route: unknown) => calls.push(JSON.stringify(route));
    const calls: string[] = [];
    expect(mobileVoiceDeletionStatusCopy({ ...completed, phase: "completed" })).toContain("削除しました");
    expect(mobileVoiceDeletionStatusCopy({ state: "already_no_voice", phase: "none", canAdvance: false, canRetry: false })).toContain("削除対象");
    navigateToVoiceSetupAfterDeletion(onNavigate);
    expect(calls).toEqual(['{"name":"voice_setup"}']);
  });
});
