#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function printCheck(label, ok, detail) {
  console.log(`- ${label}: ${ok ? "ok" : "failed"}${detail ? ` (${detail})` : ""}`);
}

function assertCheck(label, ok, detail) {
  printCheck(label, ok, detail);

  if (!ok) {
    throw new Error(label);
  }
}

function includesAll(source, needles) {
  return needles.every((needle) => source.includes(needle));
}

console.log("Native Minute account deletion provider cleanup self-test");
console.log("- scope: guarded static/self-test only; no ElevenLabs API calls");
console.log("- secret values: hidden");

const service = read("services/account-deletion/account-deletion.service.ts");
const provider = read("providers/voice/elevenlabs.ts");
const envExample = read(".env.example");

assertCheck(
  "actual provider cleanup service is present",
  includesAll(service, [
    "runElevenLabsProviderCleanupActual",
    "collectOwnedElevenLabsCleanupCandidates",
    "updateProviderCleanupRequest"
  ]),
  "service layer owns the actual stage"
);

assertCheck(
  "destructive guard is required before delete",
  includesAll(service, [
    "NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE",
    "destructiveGuard",
    "no provider delete is called and no request status is updated"
  ]),
  "default execution stays blocked"
);

assertCheck(
  "request/stage guard is enforced",
  includesAll(service, [
    "PROVIDER_CLEANUP_ACTUAL_RUNNABLE_STATUSES",
    "requestIdMatched",
    "providerStageRunnable",
    "dryRunRunnable"
  ]),
  "confirmed request and provider stage are required"
);

assertCheck(
  "fake adapter seam exists for non-live self-test",
  includesAll(service, [
    "deleteVoice?: ElevenLabsVoiceDeleteFn",
    "const deleteVoice = input.deleteVoice",
    "deleteVoice(candidate.providerVoiceId)"
  ]),
  "tests can inject a fake delete function"
);

assertCheck(
  "ElevenLabs delete adapter uses DELETE /v1/voices/:voice_id",
  includesAll(provider, [
    "ELEVENLABS_VOICES_URL",
    "deleteElevenLabsVoiceForAccountDeletion",
    "method: \"DELETE\"",
    "encodeURIComponent(input.providerVoiceId)"
  ]),
  "adapter boundary owns provider-specific delete"
);

assertCheck(
  "provider delete failure is sanitized",
  includesAll(provider, [
    "ElevenLabsVoiceDeletionClassification",
    "safeReasonCode",
    "voice-delete-reject",
    "message: classification"
  ]),
  "raw provider body is not logged by delete cleanup"
);

assertCheck(
  "provider cleanup failure stops before later stages",
  includesAll(service, [
    "status: \"provider_cleanup_failed\"",
    "ElevenLabs provider cleanup failed; later Storage, DB, and Auth cleanup must not run.",
    "actual cleanup stops after provider stage; Storage, DB, and Auth cleanup are not executed here."
  ]),
  "provider stage does not advance storage/db/auth"
);

assertCheck(
  "env example documents destructive guard as off by default",
  envExample.includes("NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE="),
  "operator must explicitly enable destructive account deletion"
);

const forbiddenOutputProbe = JSON.stringify({
  status: "failed",
  failureReasonCode: "elevenlabs_voice_delete_auth_failed",
  notes: ["safe summary only"]
});

assertCheck(
  "fixture safe summary contains no raw provider id or secret",
  !forbiddenOutputProbe.includes("provider_voice_id") &&
    !forbiddenOutputProbe.includes("xi-api-key") &&
    !forbiddenOutputProbe.includes("voice_abc123") &&
    !forbiddenOutputProbe.includes("ELEVENLABS_API_KEY"),
  "self-test fixture stays redacted"
);

console.log("\nResult: provider cleanup actual boundary is guarded and non-live self-test passed.");
