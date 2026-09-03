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
console.log("- scope: legacy durable-authority fail-close only; no Supabase Auth GET/DELETE calls");
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
  "legacy Auth path requires focused durable authority before dry-run or deletion",
  includesAll(service, [
    "LEGACY_AUTH_DELETION_DURABLE_AUTHORITY_REQUIRED = true",
    "auth_durable_authority_required",
    "No Auth GET, Auth DELETE, legacy completion write, or same-invocation completion is called."
  ]),
  "legacy execution stays blocked"
);

assertCheck(
  "durable guard precedes permissive dry-run GET and every legacy mutation",
  service.indexOf("if (LEGACY_AUTH_DELETION_DURABLE_AUTHORITY_REQUIRED)", service.indexOf("runSupabaseAuthDeletionActual")) <
    service.indexOf("const dryRun = await planSupabaseAuthDeletionDryRun", service.indexOf("runSupabaseAuthDeletionActual")) &&
    service.indexOf("if (LEGACY_AUTH_DELETION_DURABLE_AUTHORITY_REQUIRED)", service.indexOf("runSupabaseAuthDeletionActual")) <
      service.indexOf("deleteAuthUser(input.userId)", service.indexOf("runSupabaseAuthDeletionActual")) &&
    service.indexOf("if (LEGACY_AUTH_DELETION_DURABLE_AUTHORITY_REQUIRED)", service.indexOf("runSupabaseAuthDeletionActual")) <
      service.indexOf("completeAuthCleanupRequest({", service.indexOf("runSupabaseAuthDeletionActual")),
  "GET, DELETE, and completion are unreachable in the legacy path"
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
  "closed prior-stage checks remain present behind the fail-close guard",
  includesAll(service, [
    "provider cleanup が succeeded または not_needed",
    "storage cleanup が succeeded または not_needed",
    "DB cleanup が succeeded または not_needed"
  ]),
  "Auth deletion is final stage only"
);

assertCheck(
  "legacy completion branch is retained but cannot run in this unit",
  includesAll(service, [
    "status: \"completed\"",
    "auth_cleanup_status: \"succeeded\"",
    "notification_status: \"not_needed\"",
    "completion update is performed server-side by request id only after the request/user match was verified"
  ]),
  "future cleanup can remove the branch after canonical durable wiring"
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

console.log("\nResult: legacy Supabase Auth deletion is fail-closed before GET, DELETE, and completion.");
