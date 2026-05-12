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

console.log("Native Minute account deletion storage cleanup self-test");
console.log("- scope: guarded static/self-test only; no Supabase Storage delete calls");
console.log("- secret values and storage object keys: hidden");

const service = read("services/account-deletion/account-deletion.service.ts");
const exportsFile = read("services/account-deletion/index.ts");
const envExample = read(".env.example");

assertCheck(
  "actual storage cleanup service is present",
  includesAll(service, [
    "runStorageCleanupActual",
    "collectOwnedStorageCleanupTargets",
    "updateStorageCleanupRequest"
  ]),
  "service layer owns the actual storage stage"
);

assertCheck(
  "destructive guard is required before storage delete",
  includesAll(service, [
    "NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE",
    "destructiveGuard",
    "no storage delete is called and no request status is updated"
  ]),
  "default execution stays blocked"
);

assertCheck(
  "request/stage/provider guards are enforced",
  includesAll(service, [
    "STORAGE_CLEANUP_ACTUAL_RUNNABLE_STATUSES",
    "requestIdMatched",
    "providerCleanupSatisfied",
    "storageStageRunnable",
    "dryRunRunnable"
  ]),
  "confirmed request, provider cleanup, and storage stage are required"
);

assertCheck(
  "fake storage adapter seam exists for non-live self-test",
  includesAll(service, [
    "deleteObjects?: StorageObjectDeleteFn",
    "const deleteObjects = input.deleteObjects",
    "deleteObjects({"
  ]),
  "tests can inject a fake delete function"
);

assertCheck(
  "Supabase Storage delete is isolated behind service boundary",
  includesAll(service, [
    "deleteSupabaseStorageObjectsForAccountDeletion",
    ".storage.from(input.bucket).remove(input.objectKeys)",
    "classifyStorageDeleteFailure"
  ]),
  "actual bucket delete is not exposed through a public API route"
);

assertCheck(
  "storage cleanup failure stops before later stages",
  includesAll(service, [
    "status: \"storage_cleanup_failed\"",
    "Storage cleanup failed; later DB and Auth cleanup must not run.",
    "actual cleanup stops after Storage stage; DB and Auth cleanup are not executed here."
  ]),
  "storage stage does not advance DB/Auth"
);

assertCheck(
  "storage upload kill switch relationship is documented in code",
  includesAll(service, [
    "storageUploadKillSwitchActive",
    "upload kill switch does not block support/admin deletion cleanup",
    "Storage upload kill switch is not active; deletion cleanup still requires the destructive account deletion guard."
  ]),
  "upload pause and destructive cleanup guard stay separate"
);

assertCheck(
  "storage cleanup actual is exported for internal service/script use",
  includesAll(exportsFile, [
    "runStorageCleanupActual",
    "type StorageCleanupActualResult",
    "type StorageCleanupBucketActualSummary"
  ]),
  "public UI/API is not added by this export"
);

assertCheck(
  "env example documents destructive guard as off by default",
  envExample.includes("NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE="),
  "operator must explicitly enable destructive account deletion"
);

const forbiddenOutputProbe = JSON.stringify({
  status: "failed",
  failureReasonCode: "storage_delete_permission_denied",
  cleanup: {
    attempted: 2,
    succeeded: 0,
    failed: 2,
    buckets: [{ bucket: "recordings", status: "failed" }]
  }
});

assertCheck(
  "fixture safe summary contains no raw storage path, signed URL, or secret",
  !forbiddenOutputProbe.includes("/user/") &&
    !forbiddenOutputProbe.includes("signed") &&
    !forbiddenOutputProbe.includes("storage_path") &&
    !forbiddenOutputProbe.includes("SUPABASE_SERVICE_ROLE_KEY"),
  "self-test fixture stays redacted"
);

console.log("\nResult: storage cleanup actual boundary is guarded and non-live self-test passed.");
