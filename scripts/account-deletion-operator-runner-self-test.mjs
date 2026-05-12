#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  assessDisposableProofCandidate,
  buildSafeSummary,
  parseArgs,
  resolveAccountDeletionRequestReadOnly,
  runAccountDeletionOperator,
  sanitizeReadOnlyRequestResolverResult,
  sanitizeRequestResolverResult,
  sanitizeStageServiceResult
} from "./account-deletion-operator-runner.mjs";

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

function assertSafeOutput(label, summary) {
  const output = JSON.stringify(summary);
  const forbidden = [
    "user_",
    "voice_",
    "provider_voice_id",
    "storage_path",
    "object_key",
    "signed",
    "row_id",
    "transcript",
    "script body",
    "service_role",
    "token",
    "req_raw",
    "user_raw",
    "delreq_raw",
    "request_raw",
    "8d9c6c2a-1111-4111-8111-123456789abc",
    "9d9c6c2a-2222-4222-9222-123456789abc",
    "adr_1234567890abcdef1234567890abcdef",
    "secret@example.com",
    "raw provider"
  ];

  assertCheck(
    label,
    forbidden.every((needle) => !output.includes(needle)),
    "self-test summary stays redacted"
  );
}

console.log("Native Minute account deletion operator runner self-test");
console.log("- scope: internal CLI skeleton only; no destructive services are called");
console.log("- secret values and raw cleanup targets: hidden");

const runner = read("scripts/account-deletion-operator-runner.mjs");
const packageJson = read("package.json");

assertCheck(
  "package script is registered",
  packageJson.includes("\"account-deletion:operator\"") &&
    packageJson.includes("node scripts/account-deletion-operator-runner.mjs") &&
    packageJson.includes("\"account-deletion:operator:self-test\""),
  "operator runner can be invoked explicitly"
);

assertCheck(
  "dry-run default is implemented",
  includesAll(runner, [
    "const mode = parsed.execute ? \"execute\" : \"dry_run\"",
    "Dry-run is the default",
    "destructiveOperationsAttempted: 0"
  ]),
  "runner does not require --dry-run to stay non-destructive"
);

assertCheck(
  "one stage per invocation is enforced",
  includesAll(runner, [
    "multiple_stages_not_allowed",
    "oneStagePerInvocation",
    "stages[0].includes(\",\")"
  ]),
  "multi-stage execution is blocked"
);

assertCheck(
  "destructive guard and acknowledgement are required for execute mode",
  includesAll(runner, [
    "NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE",
    "destructive_guard_missing",
    "irreversible_acknowledgement_missing",
    "latest_dry_run_runnable_required",
    "prior_stage_not_satisfied",
    "proof_path_required_for_execute",
    "actual_service_not_connected_in_skeleton"
  ]),
  "execute mode remains blocked in this skeleton"
);

assertCheck(
  "actual destructive service and execute resolver seams are disconnected by default",
  includesAll(runner, [
    "actualServiceConnected: false",
    "requestResolverConnected: false",
    "runAccountDeletionOperator",
    "resolveAccountDeletionRequestReadOnly",
    "sanitizeReadOnlyRequestResolverResult",
    "assessDisposableProofCandidate",
    "sanitizeRequestResolverResult",
    "sanitizeStageServiceResult",
    "Actual stage services remain disconnected",
    "this skeleton does not call actual provider, Storage, DB, or Auth deletion services"
  ]),
  "default CLI has read-only status resolver only; execute resolver and stage services remain disconnected"
);

const missingStage = buildSafeSummary(parseArgs([]), {});
assertCheck(
  "missing stage is blocked",
  missingStage.status === "blocked" && missingStage.safeReasonCode === "stage_missing",
  "operator must choose exactly one stage"
);
assertSafeOutput("missing stage output is safe", missingStage);

const multipleStages = buildSafeSummary(parseArgs(["--stage", "provider,storage"]), {});
assertCheck(
  "multiple stages are blocked",
  multipleStages.status === "blocked" && multipleStages.safeReasonCode === "multiple_stages_not_allowed",
  "runner cannot execute provider and storage together"
);
assertSafeOutput("multiple stage output is safe", multipleStages);

const dryRun = buildSafeSummary(parseArgs(["--stage", "provider", "--request", "req_raw_should_not_echo"]), {});
assertCheck(
  "provider dry-run returns safe ready summary",
  dryRun.status === "ready_for_dry_run" &&
    dryRun.mode === "dry_run" &&
    dryRun.proof.requestRef === "provided_not_echoed" &&
    dryRun.safeCounts.destructiveOperationsAttempted === 0,
  "request reference is accepted but not echoed"
);
assertSafeOutput("provider dry-run output is safe", dryRun);

const executeWithoutEnv = buildSafeSummary(
  parseArgs(["--stage", "provider", "--request", "req_raw_should_not_echo", "--execute"]),
  {}
);
assertCheck(
  "execute without destructive env is blocked",
  executeWithoutEnv.status === "blocked" && executeWithoutEnv.safeReasonCode === "destructive_guard_missing",
  "NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE=1 is required"
);
assertSafeOutput("execute without env output is safe", executeWithoutEnv);

const executeWithoutAck = buildSafeSummary(
  parseArgs(["--stage", "provider", "--request", "req_raw_should_not_echo", "--execute"]),
  { NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE: "1" }
);
assertCheck(
  "execute without irreversible acknowledgement is blocked",
  executeWithoutAck.status === "blocked" &&
    executeWithoutAck.safeReasonCode === "irreversible_acknowledgement_missing",
  "operator must acknowledge irreversible action"
);
assertSafeOutput("execute without acknowledgement output is safe", executeWithoutAck);

const executeWithAckFlagOnly = buildSafeSummary(
  parseArgs([
    "--stage",
    "provider",
    "--request",
    "req_raw_should_not_echo",
    "--execute",
    "--acknowledge-irreversible"
  ]),
  { NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE: "1" }
);
assertCheck(
  "acknowledgement flag without explicit value is blocked",
  executeWithAckFlagOnly.status === "blocked" &&
    executeWithAckFlagOnly.safeReasonCode === "irreversible_acknowledgement_missing",
  "operator must provide the explicit irreversible acknowledgement phrase"
);
assertSafeOutput("acknowledgement flag-only output is safe", executeWithAckFlagOnly);

const executeWithoutPriorStage = buildSafeSummary(
  parseArgs([
    "--stage",
    "storage",
    "--request",
    "req_raw_should_not_echo",
    "--execute",
    "--proof",
    "proof_raw_path_should_not_echo.md",
    "--latest-dry-run-runnable",
    "--acknowledge-irreversible",
    "I_UNDERSTAND_ACCOUNT_DELETION_IS_IRREVERSIBLE"
  ]),
  { NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE: "1" }
);
assertCheck(
  "execute without prior stage satisfaction is blocked",
  executeWithoutPriorStage.status === "blocked" &&
    executeWithoutPriorStage.safeReasonCode === "prior_stage_not_satisfied",
  "storage/database/auth cannot run before earlier stages are satisfied"
);
assertSafeOutput("execute without prior stage output is safe", executeWithoutPriorStage);

const executeWithAllSkeletonGuards = buildSafeSummary(
  parseArgs([
    "--stage",
    "provider",
    "--request",
    "req_raw_should_not_echo",
    "--execute",
    "--proof",
    "proof_raw_path_should_not_echo.md",
    "--latest-dry-run-runnable",
    "--acknowledge-irreversible",
    "I_UNDERSTAND_ACCOUNT_DELETION_IS_IRREVERSIBLE"
  ]),
  { NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE: "1" }
);
assertCheck(
  "execute remains blocked because skeleton is not connected to actual services",
  executeWithAllSkeletonGuards.status === "blocked" &&
    executeWithAllSkeletonGuards.safeReasonCode === "actual_service_not_connected_in_skeleton" &&
    executeWithAllSkeletonGuards.safeCounts.destructiveOperationsAttempted === 0,
  "RR-3h does not run real deletion even when guard inputs are simulated"
);
assertSafeOutput("execute skeleton output is safe", executeWithAllSkeletonGuards);

const sanitizedRawServiceResult = sanitizeStageServiceResult({
  status: "succeeded",
  safeReasonCode: "raw provider voice_abc should never print",
  safeCounts: {
    destructiveOperationsAttempted: 0,
    providerCandidates: 1,
    storageObjects: 2,
    databaseTables: 3,
    authUsers: 1
  },
  providerVoiceId: "voice_abc",
  storagePath: "storage_path/secret"
});
assertCheck(
  "stage service result sanitizer drops raw-looking reason values",
  sanitizedRawServiceResult.safeReasonCode === "stage_service_result",
  "fake/actual service summaries cannot pass through raw-looking values"
);
assertSafeOutput("sanitized service result output is safe", sanitizedRawServiceResult);

const sanitizedRawResolverResult = sanitizeRequestResolverResult({
  status: "resolved",
  internal: {
    userId: "user_raw_should_not_echo",
    deletionRequestId: "delreq_raw_should_not_echo",
    email: "secret@example.com"
  },
  safeReasonCode: "request_raw_should_not_echo"
});
assertCheck(
  "request resolver sanitizer keeps internal target out of safe markers",
  sanitizedRawResolverResult.ok === true &&
    sanitizedRawResolverResult.safeRequest.userRef === "resolved_not_echoed" &&
    sanitizedRawResolverResult.safeRequest.deletionRequestRef === "resolved_not_echoed",
  "resolver can carry internal target without exposing it in safe markers"
);
assertSafeOutput("sanitized resolver result safe markers are safe", sanitizedRawResolverResult.safeRequest);

const sanitizedReadOnlyStatus = sanitizeReadOnlyRequestResolverResult({
  ok: true,
  safeRequest: {
    requestRef: "provided_not_echoed",
    userRef: "resolved_not_echoed",
    deletionRequestRef: "resolved_not_echoed"
  },
  requestStatus: "confirmed",
  stageStatuses: {
    provider: "succeeded",
    storage: "pending",
    database: "pending",
    auth: "pending",
    notification: "pending"
  },
  safeCounts: {
    requestResolverCalls: 1,
    retryCount: 2
  },
  userId: "user_raw_should_not_echo",
  deletionRequestId: "delreq_raw_should_not_echo",
  email: "secret@example.com"
});
assertCheck(
  "read-only request status sanitizer keeps raw target out of safe status",
  sanitizedReadOnlyStatus.ok === true &&
    sanitizedReadOnlyStatus.requestStatus === "confirmed" &&
    sanitizedReadOnlyStatus.stageStatuses.provider === "succeeded" &&
    sanitizedReadOnlyStatus.safeCounts.retryCount === 2,
  "status/summary output is limited to safe lifecycle fields"
);
assertSafeOutput("sanitized read-only status output is safe", sanitizedReadOnlyStatus);

let readOnlyResolverCalls = 0;
const readOnlyStatusResult = await runAccountDeletionOperator(
  parseArgs([
    "--stage",
    "status",
    "--request",
    "8d9c6c2a-1111-4111-8111-123456789abc"
  ]),
  {
    env: {},
    requestResolver: async (input) => {
      readOnlyResolverCalls += 1;
      assertCheck(
        "fake read-only resolver receives request ref only for status stage",
        input.stage === "status" &&
          input.mode === "read_only_status" &&
          input.requestRef === "8d9c6c2a-1111-4111-8111-123456789abc",
        "request ref is used only inside resolver and is not echoed"
      );
      return {
        ok: true,
        safeRequest: {
          requestRef: "provided_not_echoed",
          userRef: "resolved_not_echoed",
          deletionRequestRef: "resolved_not_echoed"
        },
        requestStatus: "confirmed",
        stageStatuses: {
          provider: "succeeded",
          storage: "pending",
          database: "pending",
          auth: "pending",
          notification: "pending"
        },
        safeCounts: {
          requestResolverCalls: 1,
          retryCount: 0
        },
        internal: {
          userId: "user_raw_should_not_echo",
          deletionRequestId: "delreq_raw_should_not_echo"
        }
      };
    },
    stageServices: {
      provider: async () => {
        throw new Error("destructive service must not be called by status stage");
      }
    }
  }
);
assertCheck(
  "status stage can use read-only resolver without destructive service",
  readOnlyStatusResult.status === "ready_for_dry_run" &&
    readOnlyStatusResult.deletionRequest.status === "confirmed" &&
    readOnlyStatusResult.deletionRequest.stageStatuses.provider === "succeeded" &&
    readOnlyStatusResult.guard.readOnlyResolver === true &&
    readOnlyStatusResult.guard.stageServiceCalled === false &&
    readOnlyResolverCalls === 1,
  "status/summary resolver is read-only and does not call stage services"
);
assertSafeOutput("read-only status output is safe", readOnlyStatusResult);

let destructiveDryRunResolverCalls = 0;
const destructiveDryRun = await runAccountDeletionOperator(
  parseArgs([
    "--stage",
    "provider",
    "--request",
    "9d9c6c2a-2222-4222-9222-123456789abc"
  ]),
  {
    env: {},
    requestResolver: async () => {
      destructiveDryRunResolverCalls += 1;
      return { ok: true };
    },
    stageServices: {
      provider: async () => {
        throw new Error("destructive service must not be called by dry-run");
      }
    }
  }
);
assertCheck(
  "destructive stage dry-run does not use real resolver or service",
  destructiveDryRun.status === "ready_for_dry_run" &&
    destructiveDryRunResolverCalls === 0 &&
    destructiveDryRun.safeCounts.destructiveOperationsAttempted === 0,
  "provider/storage/database/auth dry-run remains summary-only"
);
assertSafeOutput("destructive stage dry-run output is safe", destructiveDryRun);

const readOnlyResolverBlocked = await resolveAccountDeletionRequestReadOnly(
  {
    stage: "provider",
    requestRef: "8d9c6c2a-1111-4111-8111-123456789abc"
  },
  {}
);
assertCheck(
  "real read-only resolver refuses destructive stages before DB lookup",
  readOnlyResolverBlocked.ok === false &&
    readOnlyResolverBlocked.safeReasonCode === "read_only_resolver_stage_not_allowed",
  "read-only resolver is status/summary only"
);
assertSafeOutput("read-only resolver blocked output is safe", readOnlyResolverBlocked);

const disposableCandidatePass = assessDisposableProofCandidate({
  requestStatus: "confirmed",
  stageStatuses: {
    provider: "pending",
    storage: "pending",
    database: "pending",
    auth: "pending"
  },
  confirmations: {
    disposableAccount: true,
    ownerConfirmed: true,
    reviewerConfirmed: true,
    approverConfirmed: true,
    dryRunsRunnable: true,
    humanChecksAligned: true
  }
});
assertCheck(
  "disposable proof candidate can pass with safe confirmations",
  disposableCandidatePass.status === "pass" && disposableCandidatePass.safeReasonCode === null,
  "candidate PASS is based on lifecycle/status markers and explicit operator confirmations"
);
assertSafeOutput("disposable candidate PASS output is safe", disposableCandidatePass);

const realUserLikeCandidateBlocked = assessDisposableProofCandidate({
  requestStatus: "confirmed",
  stageStatuses: {
    provider: "pending",
    storage: "pending",
    database: "pending",
    auth: "pending"
  },
  confirmations: {
    disposableAccount: false,
    ownerConfirmed: true,
    reviewerConfirmed: true,
    approverConfirmed: true,
    dryRunsRunnable: true,
    humanChecksAligned: true
  }
});
assertCheck(
  "real-user-like candidate is blocked",
  realUserLikeCandidateBlocked.status === "blocked" &&
    realUserLikeCandidateBlocked.safeReasonCode === "disposable_account_confirmation_missing",
  "proof cannot target a request unless disposable status is explicitly confirmed"
);
assertSafeOutput("real-user-like candidate output is safe", realUserLikeCandidateBlocked);

const missingApproverCandidateBlocked = assessDisposableProofCandidate({
  requestStatus: "confirmed",
  stageStatuses: {
    provider: "pending",
    storage: "pending",
    database: "pending",
    auth: "pending"
  },
  confirmations: {
    disposableAccount: true,
    ownerConfirmed: true,
    reviewerConfirmed: true,
    approverConfirmed: false,
    dryRunsRunnable: true,
    humanChecksAligned: true
  }
});
assertCheck(
  "missing approver blocks disposable proof candidate",
  missingApproverCandidateBlocked.status === "blocked" &&
    missingApproverCandidateBlocked.safeReasonCode === "approver_confirmation_missing",
  "operator cannot approve their way into destructive proof without approver confirmation"
);
assertSafeOutput("missing approver candidate output is safe", missingApproverCandidateBlocked);

const dryRunMismatchCandidateBlocked = assessDisposableProofCandidate({
  requestStatus: "confirmed",
  stageStatuses: {
    provider: "pending",
    storage: "failed",
    database: "pending",
    auth: "pending"
  },
  confirmations: {
    disposableAccount: true,
    ownerConfirmed: true,
    reviewerConfirmed: true,
    approverConfirmed: true,
    dryRunsRunnable: true,
    humanChecksAligned: true
  }
});
assertCheck(
  "dry-run mismatch or stale stage status blocks proof candidate",
  dryRunMismatchCandidateBlocked.status === "blocked" &&
    dryRunMismatchCandidateBlocked.safeReasonCode === "stage_status_not_fresh",
  "candidate must be a fresh confirmed request before first destructive proof"
);
assertSafeOutput("dry-run mismatch candidate output is safe", dryRunMismatchCandidateBlocked);

let candidateStatusResolverCalls = 0;
const candidateStatusResult = await runAccountDeletionOperator(
  parseArgs([
    "--stage",
    "summary",
    "--request",
    "8d9c6c2a-1111-4111-8111-123456789abc",
    "--proof-candidate-disposable",
    "--proof-candidate-owner-confirmed",
    "--proof-candidate-reviewer-confirmed",
    "--proof-candidate-approver-confirmed",
    "--proof-candidate-dry-runs-runnable",
    "--proof-candidate-human-checks-aligned"
  ]),
  {
    env: {},
    requestResolver: async () => {
      candidateStatusResolverCalls += 1;
      return {
        ok: true,
        safeRequest: {
          requestRef: "provided_not_echoed",
          userRef: "resolved_not_echoed",
          deletionRequestRef: "resolved_not_echoed"
        },
        requestStatus: "confirmed",
        stageStatuses: {
          provider: "pending",
          storage: "pending",
          database: "pending",
          auth: "pending",
          notification: "pending"
        },
        safeCounts: {
          requestResolverCalls: 1,
          retryCount: 0
        },
        internal: {
          userId: "user_raw_should_not_echo",
          deletionRequestId: "delreq_raw_should_not_echo"
        }
      };
    },
    stageServices: {}
  }
);
assertCheck(
  "operator summary can return disposable proof candidate PASS without destructive service",
  candidateStatusResult.status === "ready_for_dry_run" &&
    candidateStatusResult.proofCandidate.status === "pass" &&
    candidateStatusResult.guard.stageServiceCalled === false &&
    candidateStatusResolverCalls === 1,
  "proof candidacy is modeled from safe status output and explicit confirmations"
);
assertSafeOutput("operator disposable candidate output is safe", candidateStatusResult);

let missingRequestResolverCalls = 0;
const blockedByMissingRequestRef = await runAccountDeletionOperator(
  parseArgs([
    "--stage",
    "provider",
    "--execute",
    "--proof",
    "proof_raw_path_should_not_echo.md",
    "--latest-dry-run-runnable",
    "--acknowledge-irreversible",
    "I_UNDERSTAND_ACCOUNT_DELETION_IS_IRREVERSIBLE"
  ]),
  {
    env: { NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE: "1" },
    requestResolver: async () => {
      missingRequestResolverCalls += 1;
      return { status: "resolved" };
    },
    stageServices: {
      provider: async () => ({ status: "succeeded" })
    }
  }
);
assertCheck(
  "request ref missing blocks before fake resolver",
  blockedByMissingRequestRef.status === "blocked" &&
    blockedByMissingRequestRef.safeReasonCode === "request_ref_required_for_execute" &&
    missingRequestResolverCalls === 0,
  "resolver is not reached without an operator request reference"
);
assertSafeOutput("missing request ref output is safe", blockedByMissingRequestRef);

let blockedServiceCalls = 0;
let blockedResolverCalls = 0;
const blockedByMissingGuard = await runAccountDeletionOperator(
  parseArgs([
    "--stage",
    "provider",
    "--request",
    "req_raw_should_not_echo",
    "--execute",
    "--proof",
    "proof_raw_path_should_not_echo.md",
    "--latest-dry-run-runnable",
    "--acknowledge-irreversible",
    "I_UNDERSTAND_ACCOUNT_DELETION_IS_IRREVERSIBLE"
  ]),
  {
    env: {},
    requestResolver: async () => {
      blockedResolverCalls += 1;
      return {
        status: "resolved",
        internal: {
          userId: "user_raw_should_not_echo",
          deletionRequestId: "delreq_raw_should_not_echo"
        }
      };
    },
    stageServices: {
      provider: async () => {
        blockedServiceCalls += 1;
        return { status: "succeeded" };
      }
    }
  }
);
assertCheck(
  "missing destructive guard blocks before fake service call",
  blockedByMissingGuard.status === "blocked" &&
    blockedByMissingGuard.safeReasonCode === "destructive_guard_missing" &&
    blockedResolverCalls === 0 &&
    blockedServiceCalls === 0,
  "resolver and service seams are not reached when destructive guard is missing"
);
assertSafeOutput("missing destructive guard output is safe", blockedByMissingGuard);

let priorStageServiceCalls = 0;
let priorStageResolverCalls = 0;
const blockedByPriorStage = await runAccountDeletionOperator(
  parseArgs([
    "--stage",
    "storage",
    "--request",
    "req_raw_should_not_echo",
    "--execute",
    "--proof",
    "proof_raw_path_should_not_echo.md",
    "--latest-dry-run-runnable",
    "--acknowledge-irreversible",
    "I_UNDERSTAND_ACCOUNT_DELETION_IS_IRREVERSIBLE"
  ]),
  {
    env: { NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE: "1" },
    requestResolver: async () => {
      priorStageResolverCalls += 1;
      return {
        status: "resolved",
        internal: {
          userId: "user_raw_should_not_echo",
          deletionRequestId: "delreq_raw_should_not_echo"
        }
      };
    },
    stageServices: {
      storage: async () => {
        priorStageServiceCalls += 1;
        return { status: "succeeded" };
      }
    }
  }
);
assertCheck(
  "missing prior stage satisfaction blocks before fake service call",
  blockedByPriorStage.status === "blocked" &&
    blockedByPriorStage.safeReasonCode === "prior_stage_not_satisfied" &&
    priorStageResolverCalls === 0 &&
    priorStageServiceCalls === 0,
  "storage/database/auth cannot reach resolver or service seams before earlier stages are satisfied"
);
assertSafeOutput("missing prior stage fake output is safe", blockedByPriorStage);

let allowedFakeCalls = 0;
let allowedResolverCalls = 0;
const fakeStageResult = await runAccountDeletionOperator(
  parseArgs([
    "--stage",
    "provider",
    "--request",
    "req_raw_should_not_echo",
    "--execute",
    "--proof",
    "proof_raw_path_should_not_echo.md",
    "--latest-dry-run-runnable",
    "--acknowledge-irreversible",
    "I_UNDERSTAND_ACCOUNT_DELETION_IS_IRREVERSIBLE"
  ]),
  {
    env: { NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE: "1" },
    requestResolver: async (input) => {
      allowedResolverCalls += 1;
      assertCheck(
        "fake resolver receives operator request ref only after modeled guards pass",
        input.requestRef === "req_raw_should_not_echo" &&
          input.stage === "provider" &&
          input.proofPath === "provided",
        "request ref is internal to resolver and is not printed"
      );
      return {
        status: "resolved",
        internal: {
          userId: "user_raw_should_not_echo",
          deletionRequestId: "delreq_raw_should_not_echo",
          email: "secret@example.com"
        },
        rawAuthPayload: "token_should_not_echo"
      };
    },
    stageServices: {
      provider: async (input) => {
        allowedFakeCalls += 1;
        assertCheck(
          "fake stage service receives internal target and safe proof markers only after resolver",
          input.request.userId === "user_raw_should_not_echo" &&
            input.request.deletionRequestId === "delreq_raw_should_not_echo" &&
            input.safeRequest.userRef === "resolved_not_echoed" &&
            input.proofPath === "provided" &&
            input.envLabel === "not_provided",
          "raw operator request ref is not handed to the fake service seam"
        );
        return {
          status: "succeeded",
          safeReasonCode: "fake_provider_cleanup_succeeded",
          safeCounts: {
            destructiveOperationsAttempted: 0,
            requestResolverCalls: 1,
            providerCandidates: 2
          },
          requestId: "delreq_raw_should_not_echo",
          userId: "user_raw_should_not_echo",
          email: "secret@example.com",
          rawProviderResponse: "raw provider response should be ignored"
        };
      }
    }
  }
);
assertCheck(
  "fake service is called only after all modeled execute guards pass",
  fakeStageResult.status === "succeeded" &&
    fakeStageResult.safeReasonCode === "fake_provider_cleanup_succeeded" &&
    fakeStageResult.guard.requestResolved === true &&
    fakeStageResult.guard.stageServiceCalled === true &&
    fakeStageResult.safeCounts.requestResolverCalls === 1 &&
    fakeStageResult.safeCounts.stageServiceCalls === 1 &&
    fakeStageResult.safeCounts.destructiveOperationsAttempted === 0 &&
    allowedResolverCalls === 1 &&
    allowedFakeCalls === 1,
  "RR-3k connects the CLI to injected fake resolver and fake service seams only"
);
assertSafeOutput("allowed fake service output is safe", fakeStageResult);

console.log("\nResult: operator runner skeleton is safe, dry-run default, and non-destructive.");
