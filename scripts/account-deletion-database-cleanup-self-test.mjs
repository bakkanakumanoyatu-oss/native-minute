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

console.log("Native Minute account deletion DB cleanup self-test");
console.log("- scope: guarded static/self-test only; no DB delete/update/anonymize calls");
console.log("- raw user data and row references: hidden");

const service = read("services/account-deletion/account-deletion.service.ts");
const exportsFile = read("services/account-deletion/index.ts");
const envExample = read(".env.example");

assertCheck(
  "actual DB cleanup service is present",
  includesAll(service, [
    "runDatabaseCleanupActual",
    "executeOwnedDatabaseCleanupForAccountDeletion",
    "updateDatabaseCleanupRequest"
  ]),
  "service layer owns the actual DB stage"
);

assertCheck(
  "destructive guard is required before DB cleanup",
  includesAll(service, [
    "NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE",
    "destructiveGuard",
    "no database delete, update, or anonymize operation is called and no request status is updated"
  ]),
  "default execution stays blocked"
);

assertCheck(
  "request/stage/provider/storage guards are enforced",
  includesAll(service, [
    "DATABASE_CLEANUP_ACTUAL_RUNNABLE_STATUSES",
    "requestIdMatched",
    "providerCleanupSatisfied",
    "storageCleanupSatisfied",
    "databaseStageRunnable",
    "dryRunRunnable"
  ]),
  "confirmed request and prior stages are required"
);

assertCheck(
  "fake DB cleanup adapter seam exists for non-live self-test",
  includesAll(service, [
    "cleanupDatabase?: DatabaseCleanupExecuteFn",
    "const cleanupDatabase = input.cleanupDatabase",
    "cleanupDatabase({"
  ]),
  "tests can inject a fake cleanup function"
);

assertCheck(
  "DB cleanup operations are isolated behind service boundary",
  includesAll(service, [
    "executeOwnedDatabaseCleanupForAccountDeletion",
    "runDatabaseCleanupOperation",
    "classifyDatabaseCleanupFailure"
  ]),
  "actual DB delete/anonymize is not exposed through a public API route"
);

assertCheck(
  "DB cleanup failure stops before Supabase Auth deletion",
  includesAll(service, [
    "status: \"db_cleanup_failed\"",
    "DB cleanup failed; Supabase Auth deletion must not run.",
    "actual cleanup stops after DB stage; Supabase Auth deletion is not executed here."
  ]),
  "DB stage does not advance Auth"
);

assertCheck(
  "retained request tracking stays server-owned",
  includesAll(service, [
    "accountDeletionRequests",
    "retain_anonymized",
    "user_id remains until Supabase Auth deletion sets it null"
  ]),
  "request row is not deleted during DB cleanup stage"
);

assertCheck(
  "DB cleanup actual is exported for internal service/script use",
  includesAll(exportsFile, [
    "runDatabaseCleanupActual",
    "type DatabaseCleanupActualResult",
    "type DatabaseCleanupTableActualSummary"
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
  failureReasonCode: "db_cleanup_constraint_failed",
  cleanup: {
    attempted: 3,
    affected: 0,
    failed: 3,
    tables: [{ table: "scripts", status: "failed" }]
  }
});

assertCheck(
  "fixture safe summary contains no raw user data or row references",
  !forbiddenOutputProbe.includes("user_id") &&
    !forbiddenOutputProbe.includes("email") &&
    !forbiddenOutputProbe.includes("transcript") &&
    !forbiddenOutputProbe.includes("script body") &&
    !forbiddenOutputProbe.includes("storage_path") &&
    !forbiddenOutputProbe.includes("provider_voice_id"),
  "self-test fixture stays redacted"
);

console.log("\nResult: DB cleanup actual boundary is guarded and non-live self-test passed.");
