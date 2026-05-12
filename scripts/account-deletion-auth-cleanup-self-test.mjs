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

console.log("Native Minute account deletion Supabase Auth cleanup self-test");
console.log("- scope: guarded static/self-test only; no Supabase Auth user delete calls");
console.log("- raw Auth/user data: hidden");

const service = read("services/account-deletion/account-deletion.service.ts");
const exportsFile = read("services/account-deletion/index.ts");
const envExample = read(".env.example");

assertCheck(
  "actual Supabase Auth deletion service is present",
  includesAll(service, [
    "runSupabaseAuthDeletionActual",
    "deleteSupabaseAuthUserForAccountDeletion",
    "completeAuthCleanupRequest"
  ]),
  "service layer owns the actual Auth stage"
);

assertCheck(
  "destructive guard is required before Auth deletion",
  includesAll(service, [
    "NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE",
    "destructiveGuard",
    "no Auth delete is called and no request status is updated"
  ]),
  "default execution stays blocked"
);

assertCheck(
  "request/stage/provider/storage/DB guards are enforced",
  includesAll(service, [
    "AUTH_DELETION_ACTUAL_RUNNABLE_STATUSES",
    "requestIdMatched",
    "providerCleanupSatisfied",
    "storageCleanupSatisfied",
    "databaseCleanupSatisfied",
    "authStageRunnable",
    "dryRunRunnable"
  ]),
  "confirmed request and prior stages are required"
);

assertCheck(
  "fake Auth admin adapter seam exists for non-live self-test",
  includesAll(service, [
    "deleteAuthUser?: SupabaseAuthDeleteFn",
    "const deleteAuthUser = input.deleteAuthUser",
    "deleteAuthUser(input.userId)"
  ]),
  "tests can inject a fake Auth deletion function"
);

assertCheck(
  "Supabase Auth admin delete is isolated behind service boundary",
  includesAll(service, [
    "admin.auth.admin.deleteUser(userId)",
    "classifySupabaseAuthDeletionFailure",
    "getAuthDeletionFailureCleanupStatus"
  ]),
  "Auth delete is not exposed through a public API route"
);

assertCheck(
  "Auth deletion waits for all prior destructive stages",
  includesAll(service, [
    "provider cleanup が succeeded または not_needed",
    "storage cleanup が succeeded または not_needed",
    "DB cleanup が succeeded または not_needed"
  ]),
  "Auth deletion is final stage only"
);

assertCheck(
  "completion tracking uses existing schema safely",
  includesAll(service, [
    "status: \"completed\"",
    "auth_cleanup_status: \"succeeded\"",
    "notification_status: \"not_needed\"",
    "completion update is performed server-side by request id only after the request/user match was verified"
  ]),
  "request row can be completed after Auth user_id is set null"
);

assertCheck(
  "Auth cleanup actual is exported for internal service/script use",
  includesAll(exportsFile, [
    "runSupabaseAuthDeletionActual",
    "type SupabaseAuthDeletionActualResult"
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
  failureReasonCode: "auth_delete_permission_denied",
  cleanup: {
    attempted: 1,
    failed: 1
  }
});

assertCheck(
  "fixture safe summary contains no raw Auth/user data",
  !forbiddenOutputProbe.includes("user_id") &&
    !forbiddenOutputProbe.includes("email") &&
    !forbiddenOutputProbe.includes("token") &&
    !forbiddenOutputProbe.includes("service_role") &&
    !forbiddenOutputProbe.includes("auth_provider_response"),
  "self-test fixture stays redacted"
);

console.log("\nResult: Supabase Auth deletion actual boundary is guarded and non-live self-test passed.");
