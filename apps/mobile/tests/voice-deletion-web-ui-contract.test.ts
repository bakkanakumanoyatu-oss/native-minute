import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  parseVoiceDeletionUiResponse,
  voiceDeletionStatusCopy
} from "@/components/voice/voice-deletion-state";

describe("Web voice-only deletion UI contract", () => {
  it.each([
    "not_requested", "processing", "retry_available", "manual_required", "completed", "already_no_voice"
  ])("accepts the safe %s DTO state only", (state) => {
    const parsed = parseVoiceDeletionUiResponse({
      ok: true,
      data: {
        deletion: {
          state,
          phase: state === "completed" ? "completed" : state === "manual_required" ? "manual_required" : "none",
          canRetry: false,
          canAdvance: false,
          operationId: "secret-operation-id",
          storageLocator: "secret-storage-locator",
          providerError: "secret-provider-error"
        }
      }
    });

    expect(parsed).toEqual({
      state,
      phase: state === "completed" ? "completed" : state === "manual_required" ? "manual_required" : "none",
      canRetry: false,
      canAdvance: false
    });
    expect(JSON.stringify(parsed)).not.toContain("secret");
  });

  it("fails closed on unknown or malformed client DTOs", () => {
    expect(parseVoiceDeletionUiResponse({ ok: true, data: { deletion: { state: "future", phase: "none", canRetry: false, canAdvance: false } } })).toBeNull();
    expect(parseVoiceDeletionUiResponse({ ok: true, data: { deletion: { state: "retry_available", phase: "snapshot", canRetry: true, canAdvance: true, retryAfterSeconds: -1 } } })).toBeNull();
  });

  it("keeps manual and completed copy explicit about preserved learning history", () => {
    expect(voiceDeletionStatusCopy({ state: "manual_required", phase: "manual_required", canRetry: false, canAdvance: false })).toContain("学習履歴は削除されていません");
    expect(voiceDeletionStatusCopy({ state: "completed", phase: "completed", canRetry: false, canAdvance: false })).toContain("学習履歴はそのまま残っています");
  });

  it("keeps confirmation separate from account deletion and never asks for typed DELETE", async () => {
    const panelPath = fileURLToPath(new URL("../../../components/voice/voice-deletion-panel.tsx", import.meta.url));
    const source = await readFile(panelPath, "utf8");
    expect(source).toContain("クローンボイスと、それを作るために保存した音声データを削除します。アカウントと英語学習の記録は残ります。");
    expect(source).toContain('fetch("/api/voice-deletion/request"');
    expect(source).toContain('fetch("/api/voice-deletion/advance"');
    expect(source).not.toContain("account-deletion");
    expect(source).not.toMatch(/type="text"/);
  });
});
