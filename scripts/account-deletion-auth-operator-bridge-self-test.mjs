#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import {
  createAccountDeletionAuthOperatorBridge,
  resolveAccountDeletionAuthOperatorRequest,
  runAccountDeletionAuthOperatorStage
} from "../services/account-deletion/account-deletion-auth-operator.service.ts";
import {
  ACCOUNT_DELETION_AUTH_INTENT_VERSION
} from "../services/account-deletion/account-deletion-auth-durable.repository.ts";
import {
  parseArgs,
  runAccountDeletionOperator,
  sanitizeRequestResolverResult,
  sanitizeStageServiceResult
} from "./account-deletion-operator-runner.mjs";

const REQUEST_A = "11111111-1111-4111-8111-111111111111";
const REQUEST_B = "22222222-2222-4222-8222-222222222222";
const USER_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const USER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OPAQUE_A = "adr_11111111111111111111111111111111";
const NOW = "2026-09-03T00:00:00.000Z";
const FAKE_EXECUTE_ENV = { NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE: "1" };
const EXPECTED_0026_SHA = "4c9a34ddb0ded45e02edd345fb0dcebd171cb5aaa5866b5c9ea5b9146e312b81";

function assertCheck(label, condition, detail) {
  if (!condition) throw new Error(`${label}: ${detail}`);
  console.log(`PASS ${label}`);
}

function assertSafeOutput(label, value) {
  const output = JSON.stringify(value);
  const forbidden = [
    REQUEST_A,
    REQUEST_B,
    USER_A,
    USER_B,
    "auth_delete_target_user_id",
    "secret@example.com",
    "identities",
    "RAW_AUTH_PAYLOAD",
    "RAW_SQL_DETAIL",
    "FAKE_SERVICE_ROLE_KEY",
    "stack"
  ];
  assertCheck(label, forbidden.every((needle) => !output.includes(needle)), "safe output leaked a forbidden marker");
}

function requestRow(overrides = {}) {
  return {
    id: REQUEST_A,
    user_id: USER_A,
    anonymized_user_ref: OPAQUE_A,
    status: "confirmed",
    failure_stage: null,
    failure_reason_code: null,
    provider_cleanup_status: "not_needed",
    provider_snapshot_version: "g5d-2a.account-provider.v1",
    provider_snapshot_status: "sealed",
    provider_snapshot_seal_version: 1,
    provider_snapshot_sealed_at: NOW,
    provider_snapshot_target_count: 0,
    provider_verified_absent_count: 0,
    provider_runner_lease_token: null,
    provider_runner_lease_expires_at: null,
    provider_sub_finalized_at: NOW,
    provider_locator_scrubbed_at: NOW,
    storage_cleanup_status: "not_needed",
    storage_snapshot_version: "g5d-2e.account-storage.v1",
    storage_snapshot_status: "sealed",
    storage_snapshot_seal_version: 1,
    storage_snapshot_sealed_at: NOW,
    storage_snapshot_fingerprint: null,
    storage_snapshot_target_count: 0,
    storage_verified_absent_count: 0,
    storage_runner_lease_token: null,
    storage_runner_lease_expires_at: null,
    storage_sub_finalized_at: NOW,
    storage_locator_scrubbed_at: NOW,
    db_cleanup_status: "not_needed",
    db_inventory_version: "g5d-2h.account-db.v1",
    db_observed_row_count: 1,
    db_deleted_row_count: 0,
    db_anonymized_row_count: 0,
    db_retained_row_count: 1,
    db_sub_finalized_at: NOW,
    auth_cleanup_status: "pending",
    auth_intent_version: null,
    auth_delete_target_user_id: null,
    auth_delete_generation: 0,
    auth_delete_requested_at: null,
    auth_verification_attempt_count: 0,
    auth_verification_result: null,
    auth_verification_result_attempt_count: null,
    auth_verified_absent_at: null,
    auth_sub_finalized_at: null,
    retry_count: 0,
    last_attempted_at: NOW,
    metadata: {},
    ...overrides
  };
}

function sealedRow(overrides = {}) {
  return requestRow({
    auth_intent_version: ACCOUNT_DELETION_AUTH_INTENT_VERSION,
    auth_delete_target_user_id: USER_A,
    auth_delete_requested_at: NOW,
    ...overrides
  });
}

function terminalRow(status = "succeeded") {
  return sealedRow({
    user_id: null,
    auth_cleanup_status: status,
    auth_delete_generation: status === "succeeded" ? 1 : 0,
    auth_verification_attempt_count: 2,
    auth_verified_absent_at: NOW,
    auth_sub_finalized_at: NOW,
    auth_delete_target_user_id: null,
    auth_verification_result: null,
    auth_verification_result_attempt_count: null
  });
}

function clone(value) {
  return structuredClone(value);
}

function fakeRepository(initial, options = {}) {
  let row = clone(initial);
  const calls = {
    lookup: 0,
    seal: 0,
    begin: 0,
    record: 0,
    authorize: 0,
    dispatchOutcome: 0,
    finalize: 0
  };

  const repository = {
    async getRequestByAuthority(ref) {
      calls.lookup += 1;
      if (calls.lookup === options.failLookupAt) throw new Error("RAW_SQL_DETAIL");
      if (calls.lookup === options.mismatchLookupAt) return requestRow({ id: REQUEST_B });
      return ref === row.id || ref === row.anonymized_user_ref ? clone(row) : null;
    },
    async sealAuthIntent(input) {
      calls.seal += 1;
      if (input.deletionRequestId !== row.id || input.expectedUserId !== row.user_id || row.user_id === null) return null;
      if (row.auth_intent_version === null) {
        row.auth_intent_version = ACCOUNT_DELETION_AUTH_INTENT_VERSION;
        row.auth_delete_target_user_id = row.user_id;
        row.auth_delete_requested_at = NOW;
        row.auth_cleanup_status = "pending";
      }
      return clone(row);
    },
    async beginVerificationAttempt(input) {
      calls.begin += 1;
      if (
        input.deletionRequestId !== row.id ||
        input.expectedTargetUserId !== row.auth_delete_target_user_id ||
        input.expectedVerificationAttemptCount !== row.auth_verification_attempt_count ||
        row.auth_cleanup_status === "manual_required" || row.auth_sub_finalized_at
      ) return null;
      row.status = "confirmed";
      row.auth_cleanup_status = "pending";
      row.failure_stage = null;
      row.failure_reason_code = null;
      row.auth_verification_attempt_count += 1;
      row.auth_verification_result = null;
      row.auth_verification_result_attempt_count = null;
      return clone(row);
    },
    async recordVerificationResult(input) {
      calls.record += 1;
      if (calls.record === options.failRecordAt) throw new Error("RAW_SQL_DETAIL");
      if (
        input.deletionRequestId !== row.id ||
        input.expectedTargetUserId !== row.auth_delete_target_user_id ||
        input.expectedVerificationAttemptCount !== row.auth_verification_attempt_count ||
        row.auth_verification_result !== null || row.auth_verification_result_attempt_count !== null
      ) return null;

      const manual = (reason) => {
        row.status = "auth_cleanup_failed";
        row.auth_cleanup_status = "manual_required";
        row.failure_stage = "auth_cleanup";
        row.failure_reason_code = reason;
      };
      const failed = (reason) => {
        row.status = "auth_cleanup_failed";
        row.auth_cleanup_status = "failed";
        row.failure_stage = "auth_cleanup";
        row.failure_reason_code = reason;
      };
      row.auth_verification_result = input.result === "verified_absent"
        ? "absent"
        : input.result === "present"
          ? "present"
          : "unknown";
      row.auth_verification_result_attempt_count = input.expectedVerificationAttemptCount;

      if (input.result === "verified_absent") {
        row.auth_verified_absent_at = NOW;
        if (row.user_id === null) {
          row.status = "confirmed";
          row.auth_cleanup_status = "pending";
          row.failure_stage = null;
          row.failure_reason_code = null;
        } else {
          manual("auth_owner_not_null_after_verified_absence");
        }
      } else if (input.result === "present" && row.auth_delete_generation === 0) {
        row.status = "confirmed";
        row.auth_cleanup_status = "pending";
        row.failure_stage = null;
        row.failure_reason_code = null;
      } else if (input.result === "present") {
        manual("auth_user_present_after_dispatch_manual_required");
      } else if (["permission_denied", "malformed", "mismatched_user"].includes(input.result)) {
        manual(input.result === "permission_denied"
          ? "auth_get_permission_denied"
          : input.result === "mismatched_user"
            ? "auth_get_user_mismatch"
            : "auth_get_protocol_error");
      } else {
        failed(input.result === "rate_limited"
          ? "auth_get_rate_limited"
          : input.result === "timeout"
            ? "auth_get_timeout"
            : input.result === "network_error"
              ? "auth_get_network_error"
              : "auth_get_unavailable");
      }
      return clone(row);
    },
    async authorizeDeleteDispatch(input) {
      calls.authorize += 1;
      if (
        input.deletionRequestId !== row.id ||
        input.expectedTargetUserId !== row.auth_delete_target_user_id ||
        input.expectedVerificationAttemptCount !== row.auth_verification_attempt_count ||
        row.auth_verification_result_attempt_count !== input.expectedVerificationAttemptCount ||
        row.auth_verification_result !== "present" || row.auth_delete_generation !== 0
      ) return null;
      row.auth_delete_generation = 1;
      row.auth_verification_result = null;
      row.auth_verification_result_attempt_count = null;
      return clone(row);
    },
    async recordDispatchOutcome(input) {
      calls.dispatchOutcome += 1;
      const manual = input.result === "permission_denied";
      row.status = "auth_cleanup_failed";
      row.auth_cleanup_status = manual ? "manual_required" : "failed";
      row.failure_stage = "auth_cleanup";
      row.failure_reason_code = input.result === "permission_denied"
        ? "auth_delete_permission_denied"
        : input.result === "rate_limited"
          ? "auth_delete_rate_limited_outcome_unknown"
          : input.result === "timeout"
            ? "auth_delete_timeout_outcome_unknown"
            : input.result === "network_error"
              ? "auth_delete_network_error_outcome_unknown"
              : input.result === "malformed"
                ? "auth_delete_malformed_outcome_unknown"
                : "auth_delete_unavailable_outcome_unknown";
      return clone(row);
    },
    async finalizeAuthStage(input) {
      calls.finalize += 1;
      if (
        input.deletionRequestId !== row.id || row.user_id !== null ||
        row.auth_delete_generation !== input.expectedDeleteGeneration ||
        row.auth_verification_attempt_count !== input.expectedVerificationAttemptCount ||
        row.auth_verification_result !== "absent" ||
        row.auth_verification_result_attempt_count !== input.expectedVerificationAttemptCount ||
        !row.auth_verified_absent_at
      ) return null;
      row.status = "confirmed";
      row.auth_cleanup_status = input.expectedDeleteGeneration === 0 ? "not_needed" : "succeeded";
      row.auth_delete_target_user_id = null;
      row.auth_verification_result = null;
      row.auth_verification_result_attempt_count = null;
      row.auth_sub_finalized_at = NOW;
      row.failure_stage = null;
      row.failure_reason_code = null;
      return clone(row);
    }
  };

  return {
    repository,
    calls,
    row: () => clone(row),
    setOwnerNull: () => { row.user_id = null; }
  };
}

function fakeAdapter(input) {
  const calls = { gets: 0, deletes: 0, order: [] };
  const adapter = {
    async getUserById() {
      calls.order.push("GET");
      const result = input.gets[calls.gets] ?? input.gets.at(-1) ?? { kind: "unavailable" };
      calls.gets += 1;
      return result;
    },
    async deleteUser() {
      calls.order.push("DELETE");
      calls.deletes += 1;
      input.onDelete?.();
      if (input.throwDelete) throw new Error("RAW_AUTH_PAYLOAD");
      return input.deletion ?? { kind: "observed" };
    }
  };
  return { adapter, calls };
}

function lookup(rows, failed = false) {
  return async () => ({ rows: rows.map(clone), failed });
}

function executeArgs(stage, requestRef = REQUEST_A) {
  return parseArgs([
    "--stage",
    stage,
    "--request",
    requestRef,
    "--execute",
    "--proof",
    "proof-not-echoed.md",
    "--latest-dry-run-runnable",
    ...(stage === "provider" ? [] : ["--prior-stage-satisfied"]),
    "--acknowledge-irreversible",
    "I_UNDERSTAND_ACCOUNT_DELETION_IS_IRREVERSIBLE"
  ]);
}

console.log("Native Minute G5D-2O Auth canonical operator wiring behavioral fake proof");
console.log("- local injected fakes only; no Supabase/Auth/remote mutation");

{
  for (const stage of ["provider", "storage", "database"]) {
    const calls = { provider: 0, storage: 0, database: 0, auth: 0 };
    const result = await runAccountDeletionOperator(executeArgs(stage), {
      env: FAKE_EXECUTE_ENV,
      requestResolver: async () => ({
        status: "resolved",
        internal: { userId: USER_A, deletionRequestId: REQUEST_A }
      }),
      stageServices: Object.fromEntries(Object.keys(calls).map((name) => [name, async () => {
        calls[name] += 1;
        return { status: "blocked", safeReasonCode: `${name}_not_runnable`, safeProgress: { terminal: false } };
      }]))
    });
    assertCheck(`${stage} routing remains exact`, result.guard.stageServiceCalled === true && calls[stage] === 1 &&
      Object.entries(calls).filter(([name]) => name !== stage).every(([, count]) => count === 0),
    "one requested prior stage must call only its matching service");
  }

  let futureCalls = 0;
  for (const stage of ["completion", "future", "unknown"]) {
    const result = await runAccountDeletionOperator(executeArgs(stage), {
      env: FAKE_EXECUTE_ENV,
      requestResolver: async () => { futureCalls += 1; return { ok: false }; },
      stageServices: {}
    });
    assertCheck(`${stage} remains unavailable`, result.status === "blocked" && futureCalls === 0,
      "Completion/future/unknown must fail before resolver/service");
  }
}

{
  const cases = [
    ["Provider nonterminal", { provider_cleanup_status: "pending", provider_sub_finalized_at: null }],
    ["Storage nonterminal", { storage_cleanup_status: "pending", storage_sub_finalized_at: null }],
    ["Database nonterminal", { db_cleanup_status: "pending", db_sub_finalized_at: null }],
    ["malformed DB equation", { db_observed_row_count: 2 }],
    ["malformed Auth intent", {
      auth_intent_version: ACCOUNT_DELETION_AUTH_INTENT_VERSION,
      auth_delete_target_user_id: null,
      auth_delete_requested_at: NOW
    }]
  ];
  for (const [label, overrides] of cases) {
    const resolved = await resolveAccountDeletionAuthOperatorRequest(
      { stage: "auth", requestRef: REQUEST_A },
      { lookupRequest: lookup([requestRow(overrides)]) }
    );
    assertCheck(`${label} blocks before runner`, resolved.ok === false,
      "persisted prior-stage authority must be valid");
  }

  const eligible = await resolveAccountDeletionAuthOperatorRequest(
    { stage: "auth", requestRef: REQUEST_A },
    { lookupRequest: lookup([requestRow()]) }
  );
  assertCheck("persisted DB terminal makes Auth eligible", eligible.ok === true &&
    eligible.internal.deletionRequestId === REQUEST_A && eligible.internal.expectedUserId === USER_A,
  "no-intent authority derives expectedUserId from the persisted owner");

  const generation0 = await resolveAccountDeletionAuthOperatorRequest(
    { stage: "auth", requestRef: REQUEST_A },
    { lookupRequest: lookup([sealedRow()]) }
  );
  const generation1 = await resolveAccountDeletionAuthOperatorRequest(
    { stage: "auth", requestRef: OPAQUE_A },
    { lookupRequest: lookup([sealedRow({
      user_id: null,
      auth_delete_generation: 1,
      auth_verification_attempt_count: 1,
      status: "auth_cleanup_failed",
      auth_cleanup_status: "failed",
      failure_stage: "auth_cleanup",
      failure_reason_code: "auth_delete_timeout_outcome_unknown"
    })]) }
  );
  const manual = await resolveAccountDeletionAuthOperatorRequest(
    { stage: "auth", requestRef: REQUEST_A },
    { lookupRequest: lookup([sealedRow({
      status: "auth_cleanup_failed",
      auth_cleanup_status: "manual_required",
      failure_stage: "auth_cleanup",
      failure_reason_code: "auth_get_permission_denied"
    })]) }
  );
  const terminal = await resolveAccountDeletionAuthOperatorRequest(
    { stage: "auth", requestRef: OPAQUE_A },
    { lookupRequest: lookup([terminalRow()]) }
  );
  assertCheck("all current durable Auth classifications resolve", [generation0, generation1, manual, terminal]
    .every((result) => result.ok === true), "generation 0/1, manual, and terminal replay must be reachable");
  assertCheck("owner-null continuation omits deleted user identity", generation1.internal.expectedUserId === undefined &&
    terminal.internal.expectedUserId === undefined, "opaque authority plus sealed durable state is sufficient");

  const ambiguous = await resolveAccountDeletionAuthOperatorRequest(
    { stage: "auth", requestRef: OPAQUE_A },
    { lookupRequest: lookup([terminalRow(), terminalRow()]) }
  );
  const mismatch = await resolveAccountDeletionAuthOperatorRequest(
    { stage: "auth", requestRef: OPAQUE_A },
    { lookupRequest: lookup([{ ...terminalRow(), anonymized_user_ref: "adr_22222222222222222222222222222222" }]) }
  );
  assertCheck("opaque ambiguity and cross-request mismatch fail closed", ambiguous.safeReasonCode === "request_target_ambiguous" &&
    mismatch.safeReasonCode === "request_target_mismatch", "no ambiguous opaque authority reaches Auth");
}

{
  let runnerCalls = 0;
  let adapterFactoryCalls = 0;
  const bridge = createAccountDeletionAuthOperatorBridge({
    env: FAKE_EXECUTE_ENV,
    lookupRequest: lookup([requestRow()]),
    repository: fakeRepository(requestRow()).repository,
    createAuthAdapter: () => {
      adapterFactoryCalls += 1;
      return fakeAdapter({ gets: [{ kind: "unavailable" }] }).adapter;
    },
    runDurableStep: async () => {
      runnerCalls += 1;
      return {
        status: "failed",
        safeReasonCode: "auth_get_unavailable",
        safeProgress: { marker: "retry_later", terminal: false, verifiedAbsent: false, authSubFinalized: false },
        safeCounts: {
          authGetCalls: 0,
          authDeleteDispatches: 0,
          authAttempted: 0,
          destructiveOperationsAttempted: 0,
          verificationAttemptCount: 0,
          completionCalls: 0
        }
      };
    }
  });
  const result = await runAccountDeletionOperator(executeArgs("auth"), {
    env: FAKE_EXECUTE_ENV,
    requestResolver: bridge.requestResolver,
    stageServices: bridge.stageServices
  });
  assertCheck("auth routes to the Auth resolver/service", result.stage === "auth" && runnerCalls === 1 &&
    adapterFactoryCalls === 1 && result.safeCounts.authDurableRunnerCalls === 1,
  "Auth must not fall back to Storage/Database");

  let blockedRunnerCalls = 0;
  const blockedBridge = createAccountDeletionAuthOperatorBridge({
    env: FAKE_EXECUTE_ENV,
    lookupRequest: lookup([requestRow({ db_cleanup_status: "pending", db_sub_finalized_at: null })]),
    runDurableStep: async () => { blockedRunnerCalls += 1; return {}; }
  });
  const callerFlagOnly = await runAccountDeletionOperator(executeArgs("auth"), {
    env: FAKE_EXECUTE_ENV,
    requestResolver: blockedBridge.requestResolver,
    stageServices: blockedBridge.stageServices
  });
  assertCheck("caller prior-stage flag alone authorizes zero", callerFlagOnly.status === "blocked" && blockedRunnerCalls === 0,
    "persisted DB terminal authority is mandatory");
}

{
  let outerResolverCalls = 0;
  let outerServiceCalls = 0;
  const outerGuarded = await runAccountDeletionOperator(executeArgs("auth"), {
    env: {},
    requestResolver: async () => { outerResolverCalls += 1; return {}; },
    stageServices: { auth: async () => { outerServiceCalls += 1; return {}; } }
  });
  assertCheck("outer guard blocks Auth before resolver/service/runner/adapter", outerGuarded.safeReasonCode === "destructive_guard_missing" &&
    outerResolverCalls === 0 && outerServiceCalls === 0 && outerGuarded.safeCounts.authDurableRunnerCalls === 0 &&
    outerGuarded.safeCounts.authGetCalls === 0 && outerGuarded.safeCounts.authDeleteDispatches === 0,
  "canonical outer guard has precedence over all Auth work");

  let repositoryFactoryCalls = 0;
  let authFactoryCalls = 0;
  let runnerCalls = 0;
  const guarded = await runAccountDeletionAuthOperatorStage(
    { stage: "auth", mode: "execute", request: { deletionRequestId: REQUEST_A } },
    {
      env: {},
      createRepository: () => { repositoryFactoryCalls += 1; return fakeRepository(requestRow()).repository; },
      createAuthAdapter: () => { authFactoryCalls += 1; return fakeAdapter({ gets: [] }).adapter; },
      runDurableStep: async () => { runnerCalls += 1; return {}; }
    }
  );
  assertCheck("Auth service guard precedes all construction/calls", guarded.safeReasonCode === "destructive_guard_missing" &&
    repositoryFactoryCalls === 0 && authFactoryCalls === 0 && runnerCalls === 0,
  "defensive guard must stop repository, runner, and adapter");

  const crossStore = fakeRepository(requestRow());
  let crossAdapterFactoryCalls = 0;
  const cross = await runAccountDeletionAuthOperatorStage(
    { stage: "auth", mode: "execute", request: { deletionRequestId: REQUEST_A, expectedUserId: USER_B } },
    {
      env: FAKE_EXECUTE_ENV,
      repository: crossStore.repository,
      createAuthAdapter: () => { crossAdapterFactoryCalls += 1; return fakeAdapter({ gets: [] }).adapter; }
    }
  );
  assertCheck("User A/B mismatch reaches no external Auth adapter", cross.safeReasonCode === "auth_request_authority_mismatch" &&
    crossAdapterFactoryCalls === 0 && cross.safeCounts.authDurableRunnerCalls === 0 && cross.safeCounts.authGetCalls === 0 &&
    cross.safeCounts.authDeleteDispatches === 0, "persisted owner is the pre-intent authority");
}

{
  const manualStore = fakeRepository(sealedRow({
    status: "auth_cleanup_failed",
    auth_cleanup_status: "manual_required",
    failure_stage: "auth_cleanup",
    failure_reason_code: "auth_get_user_mismatch",
    auth_verification_attempt_count: 1,
    auth_verification_result: "unknown",
    auth_verification_result_attempt_count: 1
  }));
  const manualAuth = fakeAdapter({ gets: [{ kind: "present" }] });
  const manual = await runAccountDeletionAuthOperatorStage(
    { stage: "auth", mode: "execute", request: { deletionRequestId: REQUEST_A } },
    { env: FAKE_EXECUTE_ENV, repository: manualStore.repository, authAdapter: manualAuth.adapter }
  );
  assertCheck("valid manual authority reaches runner once with no external call", manual.status === "manual_required" &&
    manual.safeReasonCode === "auth_get_user_mismatch" && manual.safeCounts.authDurableRunnerCalls === 1 &&
    manual.safeCounts.authGetCalls === 0 && manual.safeCounts.authDeleteDispatches === 0,
  "manual durable state is replayable without mutation or target exposure");
}

{
  const store = fakeRepository(requestRow());
  const auth = fakeAdapter({
    gets: [{ kind: "present" }, { kind: "verified_absent" }],
    deletion: { kind: "observed" },
    onDelete: store.setOwnerNull
  });
  const result = await runAccountDeletionAuthOperatorStage(
    { stage: "auth", mode: "execute", request: { deletionRequestId: REQUEST_A } },
    { env: FAKE_EXECUTE_ENV, repository: store.repository, authAdapter: auth.adapter }
  );
  assertCheck("succeeded terminal mapping is persisted and exactly once", result.status === "succeeded" &&
    result.safeProgress.terminal === true && result.safeProgress.verifiedAbsent === true &&
    result.safeProgress.authSubFinalized === true && result.safeCounts.authDurableRunnerCalls === 1 &&
    result.safeCounts.authGetCalls === 2 && result.safeCounts.authDeleteDispatches === 1 &&
    result.safeCounts.authAttempted === 1 && result.safeCounts.destructiveOperationsAttempted === 1 &&
    result.safeCounts.verificationAttemptCount === store.row().auth_verification_attempt_count &&
    result.safeCounts.verificationAttemptCount === 2 && result.safeCounts.completionCalls === 0 &&
    auth.calls.order.join(",") === "GET,DELETE,GET",
  "service must call one runner and preserve runner-owned GET/DELETE accounting");
  assertSafeOutput("terminal output redacts durable target and raw identity", result);

  const noIntentOwnerNull = fakeRepository(sealedRow({ user_id: null }));
  const absent = fakeAdapter({ gets: [{ kind: "verified_absent" }] });
  const notNeeded = await runAccountDeletionAuthOperatorStage(
    { stage: "auth", mode: "execute", request: { deletionRequestId: REQUEST_A } },
    { env: FAKE_EXECUTE_ENV, repository: noIntentOwnerNull.repository, authAdapter: absent.adapter }
  );
  assertCheck("not_needed terminal mapping re-fetches persisted authority", notNeeded.status === "not_needed" &&
    notNeeded.safeProgress.terminal === true && notNeeded.safeCounts.authGetCalls === 1 &&
    notNeeded.safeCounts.authDeleteDispatches === 0 && noIntentOwnerNull.calls.lookup === 3,
  "generation 0 absence terminal must be persisted before operator terminal");
}

{
  const store = fakeRepository(sealedRow({
    user_id: null,
    auth_delete_generation: 1,
    auth_verification_attempt_count: 1,
    status: "auth_cleanup_failed",
    auth_cleanup_status: "failed",
    failure_stage: "auth_cleanup",
    failure_reason_code: "auth_delete_timeout_outcome_unknown"
  }));
  const auth = fakeAdapter({ gets: [{ kind: "verified_absent" }] });
  const result = await runAccountDeletionAuthOperatorStage(
    { stage: "auth", mode: "execute", request: { deletionRequestId: REQUEST_A } },
    { env: FAKE_EXECUTE_ENV, repository: store.repository, authAdapter: auth.adapter }
  );
  assertCheck("generation1 owner-null recovery is GET-first with no redispatch", result.status === "succeeded" &&
    auth.calls.order.join(",") === "GET" && result.safeCounts.authDeleteDispatches === 0 &&
    result.safeCounts.authDurableRunnerCalls === 1, "deleted userId is not required for continuation");

  const replayStore = fakeRepository(terminalRow());
  const replayAuth = fakeAdapter({ gets: [{ kind: "present" }] });
  const replay = await runAccountDeletionAuthOperatorStage(
    { stage: "auth", mode: "execute", request: { deletionRequestId: REQUEST_A } },
    { env: FAKE_EXECUTE_ENV, repository: replayStore.repository, authAdapter: replayAuth.adapter }
  );
  assertCheck("already-sub-finalized owner-null replay stays reachable", replay.status === "succeeded" &&
    replay.safeProgress.terminal === true && replay.safeCounts.authDurableRunnerCalls === 1 &&
    replay.safeCounts.authGetCalls === 0 && replay.safeCounts.authDeleteDispatches === 0 &&
    replay.safeCounts.verificationAttemptCount === 2 && replay.safeCounts.completionCalls === 0 &&
    replayStore.calls.lookup === 3, "runner classification and terminal re-fetch must make no Auth or Completion call");
}

{
  const persisted = terminalRow();
  const store = fakeRepository(persisted);
  const auth = fakeAdapter({ gets: [] });
  let runnerCalls = 0;
  const result = await runAccountDeletionAuthOperatorStage(
    { stage: "auth", mode: "execute", request: { deletionRequestId: REQUEST_A } },
    {
      env: FAKE_EXECUTE_ENV,
      repository: store.repository,
      authAdapter: auth.adapter,
      runDurableStep: async () => {
        runnerCalls += 1;
        return {
          status: "succeeded",
          safeReasonCode: null,
          safeProgress: { marker: "terminal", terminal: true, verifiedAbsent: true, authSubFinalized: true },
          safeCounts: {
            authGetCalls: 0,
            authDeleteDispatches: 0,
            authAttempted: 0,
            destructiveOperationsAttempted: 0,
            verificationAttemptCount: 999,
            completionCalls: 0
          }
        };
      }
    }
  );
  assertCheck("terminal count mismatch fails closed with unverifiable evidence", result.status === "manual_required" &&
    result.safeReasonCode === "auth_terminal_authority_missing" && result.safeProgress.marker === "unknown" &&
    result.safeProgress.terminal === false && result.safeCounts.authOutcomeUnknown === 1 &&
    result.safeCounts.verificationAttemptCount === null && runnerCalls === 1 &&
    auth.calls.gets === 0 && auth.calls.deletes === 0 && result.safeCounts.completionCalls === 0,
  "persisted count 2 must never bind a runner-reported count 999 or trigger a second runner/Auth call");
}

{
  const store = fakeRepository(requestRow(), { failRecordAt: 1 });
  const auth = fakeAdapter({ gets: [{ kind: "present" }] });
  const result = await runAccountDeletionAuthOperatorStage(
    { stage: "auth", mode: "execute", request: { deletionRequestId: REQUEST_A } },
    { env: FAKE_EXECUTE_ENV, repository: store.repository, authAdapter: auth.adapter }
  );
  assertCheck("post-GET repository failure keeps count unknown and observed calls exact", result.status === "blocked" &&
    result.safeReasonCode === "auth_durable_stage_result_unknown" && result.safeProgress.marker === "unknown" &&
    result.safeProgress.terminal === false && result.safeCounts.authOutcomeUnknown === 1 &&
    result.safeCounts.verificationAttemptCount === null && result.safeCounts.authDurableRunnerCalls === 1 &&
    result.safeCounts.authGetCalls === 1 && result.safeCounts.authDeleteDispatches === 0 &&
    result.safeCounts.destructiveOperationsAttempted === 0 && store.calls.begin === 1 &&
    store.calls.record === 1 && auth.calls.gets === 1 && auth.calls.deletes === 0,
  "a begun verification and observed GET cannot be represented as verification attempt zero after repository failure");
}

{
  for (const [kind, status, expectedUnknown] of [
    ["timeout", "failed", 1],
    ["permission_denied", "manual_required", 0]
  ]) {
    const store = fakeRepository(requestRow());
    const auth = fakeAdapter({ gets: [{ kind: "present" }], deletion: { kind } });
    const result = await runAccountDeletionAuthOperatorStage(
      { stage: "auth", mode: "execute", request: { deletionRequestId: REQUEST_A } },
      { env: FAKE_EXECUTE_ENV, repository: store.repository, authAdapter: auth.adapter }
    );
    assertCheck(`${kind} stays nonterminal with observed dispatch`, result.status === status &&
      result.safeProgress.terminal === false && result.safeCounts.authDeleteDispatches === 1 &&
      result.safeCounts.destructiveOperationsAttempted === 1 && result.safeCounts.authOutcomeUnknown === expectedUnknown,
    "DELETE evidence must survive nonterminal outcomes");
  }

  const throwStore = fakeRepository(requestRow());
  const throwing = fakeAdapter({ gets: [{ kind: "present" }], throwDelete: true });
  const afterThrow = await runAccountDeletionAuthOperatorStage(
    { stage: "auth", mode: "execute", request: { deletionRequestId: REQUEST_A } },
    { env: FAKE_EXECUTE_ENV, repository: throwStore.repository, authAdapter: throwing.adapter }
  );
  assertCheck("DELETE exception cannot become false zero", afterThrow.safeCounts.authDeleteDispatches === 1 &&
    afterThrow.safeCounts.authAttempted === 1 && afterThrow.safeCounts.destructiveOperationsAttempted === 1 &&
    afterThrow.safeCounts.authOutcomeUnknown === 1, "dispatch boundary is observed before adapter await");
  assertSafeOutput("exception output contains no raw error", afterThrow);
}

{
  const store = fakeRepository(requestRow(), { failLookupAt: 3 });
  const auth = fakeAdapter({
    gets: [{ kind: "present" }, { kind: "verified_absent" }],
    deletion: { kind: "observed" },
    onDelete: store.setOwnerNull
  });
  const result = await runAccountDeletionAuthOperatorStage(
    { stage: "auth", mode: "execute", request: { deletionRequestId: REQUEST_A } },
    { env: FAKE_EXECUTE_ENV, repository: store.repository, authAdapter: auth.adapter }
  );
  assertCheck("terminal re-fetch failure fails closed and preserves accounting", result.status === "manual_required" &&
    result.safeReasonCode === "auth_terminal_authority_missing" && result.safeProgress.terminal === false &&
    result.safeCounts.authOutcomeUnknown === 1 && result.safeCounts.authGetCalls === 2 &&
    result.safeCounts.authDeleteDispatches === 1 && result.safeCounts.destructiveOperationsAttempted === 1 &&
    result.safeCounts.verificationAttemptCount === null,
  "runner terminal-looking output alone is insufficient");
  assertSafeOutput("terminal re-fetch failure is redacted", result);
}

{
  const rogueStore = fakeRepository(sealedRow());
  const rogueAuth = fakeAdapter({ gets: [{ kind: "present" }], deletion: { kind: "observed" } });
  const rogue = await runAccountDeletionAuthOperatorStage(
    { stage: "auth", mode: "execute", request: { deletionRequestId: REQUEST_A } },
    {
      env: FAKE_EXECUTE_ENV,
      repository: rogueStore.repository,
      authAdapter: rogueAuth.adapter,
      runDurableStep: async (_input, dependencies) => {
        await dependencies.authAdapter.getUserById(USER_A);
        await dependencies.authAdapter.deleteUser(USER_A);
        throw new Error("RAW_AUTH_PAYLOAD");
      }
    }
  );
  assertCheck("rogue runner exception preserves observed calls", rogue.status === "manual_required" &&
    rogue.safeReasonCode === "auth_durable_stage_result_unknown" && rogue.safeCounts.authDurableRunnerCalls === 1 &&
    rogue.safeCounts.authGetCalls === 1 && rogue.safeCounts.authDeleteDispatches === 1 &&
    rogue.safeCounts.verificationAttemptCount === null, "untrusted evidence is nullable, never a false zero");
  assertSafeOutput("rogue runner output is redacted", rogue);

  const sanitized = sanitizeStageServiceResult({
    status: "succeeded",
    safeReasonCode: "RAW_REASON_WITH_USER_SECRET",
    safeProgress: {
      marker: "terminal",
      terminal: true,
      verifiedAbsent: "yes",
      authSubFinalized: true
    },
    safeCounts: {
      authDurableRunnerCalls: Number.MAX_SAFE_INTEGER + 1,
      authGetCalls: 1.5,
      authDeleteDispatches: "1",
      authAttempted: NaN,
      authOutcomeUnknown: Infinity,
      authTerminal: true,
      authNonterminal: -1,
      verificationAttemptCount: false,
      completionCalls: 99,
      destructiveOperationsAttempted: "1"
    },
    rawAuthUser: { id: USER_A, email: "secret@example.com" }
  }, "auth");
  assertCheck("rogue terminal/counters/reason fail close safely", sanitized.status === "manual_required" &&
    sanitized.safeReasonCode === "auth_durable_stage_result_unknown" && sanitized.progress.marker === "unknown" &&
    sanitized.progress.terminal === false && sanitized.progress.retryable === false &&
    sanitized.safeCounts.authDurableRunnerCalls === null && sanitized.safeCounts.authGetCalls === null &&
    sanitized.safeCounts.authDeleteDispatches === null && sanitized.safeCounts.verificationAttemptCount === null &&
    sanitized.safeCounts.authOutcomeUnknown === 1 && sanitized.safeCounts.authTerminal === 0 &&
    sanitized.safeCounts.authNonterminal === 1, "invalid numeric evidence must be unknown rather than zero");
  assertSafeOutput("rogue sanitizer output drops raw objects", sanitized);

  const knownReason = sanitizeStageServiceResult({
    status: "manual_required",
    safeReasonCode: "auth_get_user_mismatch",
    safeProgress: {
      marker: "manual_required",
      terminal: false,
      verifiedAbsent: false,
      authSubFinalized: false
    },
    safeCounts: {
      authDurableRunnerCalls: 1,
      authGetCalls: 1,
      authDeleteDispatches: 0,
      authAttempted: 0,
      authOutcomeUnknown: 0,
      authTerminal: 0,
      authNonterminal: 1,
      verificationAttemptCount: 1,
      completionCalls: 0,
      destructiveOperationsAttempted: 0
    }
  }, "auth");
  assertCheck("fixed Auth mismatch reason keeps exact semantics", knownReason.safeReasonCode === "auth_get_user_mismatch",
    "generic user-fragment sanitizer must not replace an allowlisted Auth reason");
}

{
  const ownerNull = sanitizeRequestResolverResult({
    status: "resolved",
    internal: { deletionRequestId: REQUEST_A }
  }, "auth");
  const owned = sanitizeRequestResolverResult({
    status: "resolved",
    internal: { deletionRequestId: REQUEST_A, expectedUserId: USER_A, auth_delete_target_user_id: USER_A }
  }, "auth");
  assertCheck("stage-aware internal authority accepts owner-null continuation", ownerNull.ok === true &&
    ownerNull.internal.expectedUserId === undefined && ownerNull.safeRequest.userRef === "not_available_after_auth_cleanup" &&
    owned.ok === true && !("auth_delete_target_user_id" in owned.internal),
  "only exact request authority and optional expectedUserId may cross the operator boundary");
  assertSafeOutput("Auth resolver sanitizer exposes no durable target", { ownerNull: ownerNull.safeRequest, owned: owned.safeRequest });
}

{
  let authCalls = 0;
  const databaseResult = await runAccountDeletionOperator(executeArgs("database"), {
    env: FAKE_EXECUTE_ENV,
    requestResolver: async () => ({ status: "resolved", internal: { userId: USER_A, deletionRequestId: REQUEST_A } }),
    stageServices: {
      database: async () => ({
        status: "not_needed",
        safeReasonCode: null,
        safeProgress: { marker: "terminal", terminal: true },
        safeCounts: {
          dbFinalizerInvocations: 1,
          dbAttempted: 1,
          dbOutcomeUnknown: 0,
          dbTerminal: 1,
          dbNonterminal: 0,
          dbObservedRowCount: 1,
          dbDeletedRowCount: 0,
          dbAnonymizedRowCount: 0,
          dbRetainedRowCount: 1,
          destructiveOperationsAttempted: 1
        }
      }),
      auth: async () => { authCalls += 1; return {}; }
    }
  });
  assertCheck("DB terminal same invocation calls Auth zero", databaseResult.status === "not_needed" && authCalls === 0,
    "one stage per invocation remains exact");

  let completionCalls = 0;
  const replayStore = fakeRepository(terminalRow());
  const bridge = createAccountDeletionAuthOperatorBridge({
    env: FAKE_EXECUTE_ENV,
    lookupRequest: lookup([terminalRow()]),
    repository: replayStore.repository,
    authAdapter: fakeAdapter({ gets: [] }).adapter
  });
  const authResult = await runAccountDeletionOperator(executeArgs("auth"), {
    env: FAKE_EXECUTE_ENV,
    requestResolver: bridge.requestResolver,
    stageServices: { ...bridge.stageServices, completion: async () => { completionCalls += 1; return {}; } }
  });
  assertCheck("Auth terminal same invocation calls Completion zero", authResult.status === "succeeded" &&
    completionCalls === 0 && authResult.safeCounts.completionCalls === 0,
  "Completion remains a future invocation and is not implemented");
}

{
  const operatorSource = readFileSync("services/account-deletion/account-deletion-auth-operator.service.ts", "utf8");
  const adapterSource = readFileSync("services/account-deletion/account-deletion-auth-adapter.ts", "utf8");
  const entrySource = readFileSync("scripts/account-deletion-operator-entry.mjs", "utf8");
  const legacySource = readFileSync("services/account-deletion/account-deletion.service.ts", "utf8");
  const packageLock = readFileSync("package-lock.json", "utf8");
  const migrationBytes = readFileSync("supabase/migrations/0026_g5d_2m_auth_deletion_durable_recovery_foundation.sql");

  assertCheck("canonical entry explicitly wires four exact stages", [
    "createAccountDeletionProviderOperatorBridge",
    "createAccountDeletionStorageOperatorBridge",
    "createAccountDeletionDatabaseOperatorBridge",
    "createAccountDeletionAuthOperatorBridge",
    "input.stage === \"provider\"",
    "input.stage === \"storage\"",
    "input.stage === \"database\"",
    "input.stage === \"auth\""
  ].every((needle) => entrySource.includes(needle)), "Auth has no Storage/DB/legacy fallback");
  assertCheck("Auth service uses one existing runner boundary and no legacy chain", operatorSource.includes("runAccountDeletionAuthDurableStep") &&
    operatorSource.includes("createAccountDeletionAuthProductionAdapter") &&
    !operatorSource.includes("runSupabaseAuthDeletionActual") &&
    !operatorSource.includes("deleteSupabaseAuthUserForAccountDeletion") &&
    !operatorSource.includes("completeAuthCleanupRequest"),
  "durable RPC/state machine and completion are not duplicated");
  assertCheck("production adapter uses locked SDK operations and bounded cancellation", adapterSource.includes("createClient<Database>") &&
    adapterSource.includes("client.auth.admin.getUserById(targetUserId)") &&
    adapterSource.includes("client.auth.admin.deleteUser(targetUserId)") &&
    adapterSource.includes("ACCOUNT_DELETION_AUTH_REQUEST_TIMEOUT_MS = 10_000") &&
    adapterSource.includes("new AbortController()") && adapterSource.includes("clearTimeout(timer)") &&
    !adapterSource.includes("Promise.race") && !adapterSource.toLowerCase().includes("retry("),
  "custom fetch owns one abortable request and no retry layer");
  assertCheck("locked SDK versions are exact", packageLock.includes('"node_modules/@supabase/supabase-js"') &&
    packageLock.includes('"version": "2.99.3"') && packageLock.includes('"node_modules/@supabase/auth-js"'),
  "installed supabase-js/auth-js 2.99.3 is the production boundary");
  assertCheck("legacy Auth durable guard remains fail-closed", legacySource.includes("LEGACY_AUTH_DELETION_DURABLE_AUTHORITY_REQUIRED = true") &&
    legacySource.includes("auth_durable_authority_required"), "legacy GET/DELETE/completion remains unreachable");
  assertCheck("migration 0026 is unchanged and no 0027 exists", createHash("sha256").update(migrationBytes).digest("hex") === EXPECTED_0026_SHA &&
    !existsSync("supabase/migrations/0027_g5d_2o_auth_canonical_operator.sql"),
  "this unit has no migration/schema/generated-type mutation");
}

assertCheck("real boundary and destructive guard remain untouched",
  process.env.NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE !== "1",
  "fake execution authority never mutates process.env or calls Staging/Production/Auth");

console.log("\nResult: G5D-2O Auth canonical operator wiring behavioral fake proof passed.");
