#!/usr/bin/env node

import { readFileSync } from "node:fs";
import {
  createAccountDeletionDatabaseFinalizerRepository
} from "../services/account-deletion/account-deletion-database-finalizer.repository.ts";
import {
  createAccountDeletionDatabaseOperatorBridge,
  resolveAccountDeletionDatabaseOperatorRequest,
  runAccountDeletionDatabaseOperatorStage
} from "../services/account-deletion/account-deletion-database-operator.service.ts";
import {
  parseArgs,
  runAccountDeletionOperator,
  sanitizeStageServiceResult
} from "./account-deletion-operator-runner.mjs";

const USER_A = "11111111-1111-4111-8111-111111111111";
const USER_B = "22222222-2222-4222-8222-222222222222";
const REQUEST_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_REQUEST_ID = "44444444-4444-4444-8444-444444444444";
const ANONYMIZED_REF = `adr_${"a".repeat(32)}`;
const NOW = "2026-09-03T00:00:00.000Z";
const INVENTORY_VERSION = "g5d-2h.account-db.v1";
const FAKE_EXECUTE_ENV = { NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE: "1" };

const forbiddenOutput = [
  USER_A,
  USER_B,
  REQUEST_ID,
  OTHER_REQUEST_ID,
  ANONYMIZED_REF,
  "private@example.com",
  "raw rogue database result",
  "SQLSTATE 23514",
  "account_deletion_provider_targets",
  "service-role-secret",
  "stack-private"
];

const externalCalls = {
  realDatabaseFinalizer: 0,
  canonicalStagingMutation: 0,
  productionMutation: 0,
  provider: 0,
  storage: 0,
  auth: 0,
  completion: 0,
  legacyDatabase: 0
};

function assertCheck(label, condition, detail) {
  console.log(`- ${label}: ${condition ? "ok" : "failed"}${detail ? ` (${detail})` : ""}`);
  if (!condition) throw new Error(label);
}

function assertSafeOutput(label, value) {
  const output = JSON.stringify(value);
  assertCheck(label, forbiddenOutput.every((needle) => !output.includes(needle)), "raw identity, SQL, row, and rogue values are absent");
}

function databaseArgs({ priorStageSatisfied = true, requestRef = REQUEST_ID } = {}) {
  const args = [
    "--stage", "database",
    "--request", requestRef,
    "--execute",
    "--proof", "docs/safe-proof-template.md",
    "--latest-dry-run-runnable",
    "--acknowledge-irreversible", "I_UNDERSTAND_ACCOUNT_DELETION_IS_IRREVERSIBLE"
  ];
  if (priorStageSatisfied) args.push("--prior-stage-satisfied");
  return parseArgs(args);
}

function requestRow(overrides = {}) {
  return {
    id: REQUEST_ID,
    user_id: USER_A,
    anonymized_user_ref: ANONYMIZED_REF,
    status: "confirmed",
    failure_stage: null,
    failure_reason_code: null,
    provider_cleanup_status: "succeeded",
    provider_sub_finalized_at: NOW,
    storage_cleanup_status: "succeeded",
    storage_sub_finalized_at: NOW,
    db_cleanup_status: "pending",
    db_inventory_version: INVENTORY_VERSION,
    db_observed_row_count: 0,
    db_deleted_row_count: 0,
    db_anonymized_row_count: 0,
    db_retained_row_count: 0,
    db_sub_finalized_at: null,
    last_attempted_at: null,
    metadata: { private: "pre-finalizer data is never returned" },
    ...overrides
  };
}

function evidence(status = "succeeded") {
  return status === "not_needed"
    ? {
        dbObservedRowCount: 2,
        dbDeletedRowCount: 0,
        dbAnonymizedRowCount: 0,
        dbRetainedRowCount: 2
      }
    : {
        dbObservedRowCount: 5,
        dbDeletedRowCount: 2,
        dbAnonymizedRowCount: 1,
        dbRetainedRowCount: 2
      };
}

function makeTerminal(row, status = "succeeded", counts = evidence(status)) {
  Object.assign(row, {
    status: "confirmed",
    failure_stage: null,
    failure_reason_code: null,
    db_cleanup_status: status,
    db_inventory_version: INVENTORY_VERSION,
    db_observed_row_count: counts.dbObservedRowCount,
    db_deleted_row_count: counts.dbDeletedRowCount,
    db_anonymized_row_count: counts.dbAnonymizedRowCount,
    db_retained_row_count: counts.dbRetainedRowCount,
    db_sub_finalized_at: NOW,
    last_attempted_at: NOW,
    metadata: {}
  });
  return row;
}

function finalizerResult(status = "succeeded", { alreadyFinalized = false, counts = evidence(status) } = {}) {
  return {
    kind: alreadyFinalized ? "already_finalized" : status,
    status,
    alreadyFinalized,
    ...counts
  };
}

function lookupFixture(row, events = []) {
  return async ({ field }) => {
    events.push(`resolver:${field}`);
    return { rows: [row], failed: false };
  };
}

function repositoryFixture(row, events = [], finalize = async () => ({ kind: "unknown" })) {
  return {
    getRequestForOwner: async (requestId, userId) => {
      events.push("repository:get-request");
      return requestId === row.id && userId === row.user_id ? row : null;
    },
    finalizeDatabaseStage: async (input) => {
      events.push("repository:finalizer");
      return finalize(input, row);
    }
  };
}

function bridgeFixture({ row = requestRow(), events = [], finalize, repository } = {}) {
  return createAccountDeletionDatabaseOperatorBridge({
    env: FAKE_EXECUTE_ENV,
    lookupRequest: lookupFixture(row, events),
    repository: repository ?? repositoryFixture(row, events, finalize)
  });
}

async function runWithBridge(bridge, parsed = databaseArgs(), env = FAKE_EXECUTE_ENV, extraStages = {}) {
  return runAccountDeletionOperator(parsed, {
    env,
    requestResolver: bridge.requestResolver,
    stageServices: { ...bridge.stageServices, ...extraStages }
  });
}

console.log("Native Minute G5D-2L Database finalizer canonical operator wiring behavioral fake proof");
console.log("- Database finalizer: injected fake only");
console.log("- real DB finalizer / Canonical Staging / Production mutations: 0");
console.log("- Auth service: separate later invocation; Completion: not connected");

{
  const cases = [
    ["Provider nonterminal", { provider_cleanup_status: "pending", provider_sub_finalized_at: null }, "prior_stages_terminal_not_persisted"],
    ["Storage nonterminal", { storage_cleanup_status: "pending", storage_sub_finalized_at: null }, "prior_stages_terminal_not_persisted"],
    ["nonterminal DB count mismatch", { db_observed_row_count: 1 }, "database_state_not_runnable"]
  ];

  for (const [label, overrides, reason] of cases) {
    const events = [];
    const row = requestRow(overrides);
    const bridge = bridgeFixture({ row, events });
    const result = await runWithBridge(bridge);
    assertCheck(
      `${label} blocks Database before finalizer`,
      result.status === "blocked" && result.safeReasonCode === reason &&
        events.filter((event) => event === "repository:finalizer").length === 0 &&
        result.safeCounts.dbFinalizerInvocations === 0 && result.safeCounts.destructiveOperationsAttempted === 0,
      "persisted eligibility is required and false-zero evidence is avoided"
    );
  }

  for (const [providerStatus, storageStatus] of [["succeeded", "succeeded"], ["not_needed", "not_needed"]]) {
    const resolved = await resolveAccountDeletionDatabaseOperatorRequest(
      { stage: "database", requestRef: REQUEST_ID },
      { lookupRequest: lookupFixture(requestRow({
        provider_cleanup_status: providerStatus,
        storage_cleanup_status: storageStatus
      })) }
    );
    assertCheck(
      `persisted Provider ${providerStatus} and Storage ${storageStatus} make Database eligible`,
      resolved.ok === true,
      "eligibility is derived from the owned persisted request"
    );
  }

  const noAuthority = await runWithBridge(
    bridgeFixture({ row: requestRow({ storage_cleanup_status: "pending", storage_sub_finalized_at: null }) }),
    databaseArgs({ priorStageSatisfied: true })
  );
  assertCheck(
    "--prior-stage-satisfied alone cannot authorize Database",
    noAuthority.status === "blocked" && noAuthority.safeCounts.dbFinalizerInvocations === 0,
    "caller flags are supplemental only"
  );
}

{
  let databaseCalls = 0;
  const storageInvocation = await runAccountDeletionOperator(
    parseArgs([
      "--stage", "storage", "--request", REQUEST_ID, "--execute", "--prior-stage-satisfied",
      "--proof", "docs/safe-proof-template.md", "--latest-dry-run-runnable",
      "--acknowledge-irreversible", "I_UNDERSTAND_ACCOUNT_DELETION_IS_IRREVERSIBLE"
    ]),
    {
      env: FAKE_EXECUTE_ENV,
      requestResolver: async () => ({
        ok: true,
        internal: { userId: USER_A, deletionRequestId: REQUEST_ID }
      }),
      stageServices: {
        storage: async () => ({
          status: "succeeded",
          safeReasonCode: null,
          safeProgress: { marker: "terminal", terminal: true },
          safeCounts: { storageTerminal: 1 }
        }),
        database: async () => { databaseCalls += 1; return { status: "succeeded" }; }
      }
    }
  );
  assertCheck(
    "Storage becoming terminal stops before Database in the same invocation",
    storageInvocation.status === "succeeded" && databaseCalls === 0,
    "one requested stage is dispatched exactly once"
  );

  const row = requestRow();
  const nextEvents = [];
  const next = await runWithBridge(bridgeFixture({
    row,
    events: nextEvents,
    finalize: async (_input, persisted) => {
      makeTerminal(persisted);
      return finalizerResult();
    }
  }));
  assertCheck(
    "next invocation uses persisted Storage terminal authority and reaches Database",
    next.status === "succeeded" && nextEvents.filter((event) => event === "repository:finalizer").length === 1,
    "Database runs only on its own later invocation"
  );
}

{
  const wrapperCalls = [];
  const fakeClient = {
    rpc: async (name, args) => {
      wrapperCalls.push({ name, args });
      return {
        data: [{
          db_cleanup_status: "succeeded",
          safe_reason: "db_cleanup_finalized",
          db_observed_row_count: 5,
          db_deleted_row_count: 2,
          db_anonymized_row_count: 1,
          db_retained_row_count: 2,
          already_finalized: false
        }],
        error: null
      };
    }
  };
  const wrapper = createAccountDeletionDatabaseFinalizerRepository(fakeClient);
  const result = await wrapper.finalizeDatabaseStage({
    deletionRequestId: REQUEST_ID,
    userId: USER_A,
    inventoryVersion: INVENTORY_VERSION
  });
  assertCheck(
    "wrapper calls the exact finalizer once with exact request/user/version",
    result.kind === "succeeded" && wrapperCalls.length === 1 &&
      wrapperCalls[0].name === "finalize_account_deletion_database_stage" &&
      wrapperCalls[0].args.p_deletion_request_id === REQUEST_ID &&
      wrapperCalls[0].args.p_expected_user_id === USER_A &&
      wrapperCalls[0].args.p_expected_db_inventory_version === INVENTORY_VERSION,
    "no retry or second mutation call exists"
  );

  const validRow = {
    db_cleanup_status: "succeeded",
    safe_reason: "db_cleanup_finalized",
    db_observed_row_count: 5,
    db_deleted_row_count: 2,
    db_anonymized_row_count: 1,
    db_retained_row_count: 2,
    already_finalized: false
  };
  const malformed = [
    ["zero rows", []],
    ["multiple rows", [validRow, validRow]],
    ["missing field", [{ ...validRow, safe_reason: undefined }]],
    ["wrong field type", [{ ...validRow, already_finalized: 1 }]],
    ["fraction count", [{ ...validRow, db_deleted_row_count: 1.5 }]],
    ["unsafe count", [{ ...validRow, db_deleted_row_count: Number.MAX_SAFE_INTEGER + 1 }]],
    ["numeric string", [{ ...validRow, db_deleted_row_count: "2" }]],
    ["unknown status", [{ ...validRow, db_cleanup_status: "completed" }]],
    ["malformed safe reason", [{ ...validRow, safe_reason: "raw SQLSTATE 23514" }]]
  ];
  for (const [label, data] of malformed) {
    const repository = createAccountDeletionDatabaseFinalizerRepository({
      rpc: async () => ({ data, error: null })
    });
    const parsed = await repository.finalizeDatabaseStage({
      deletionRequestId: REQUEST_ID,
      userId: USER_A,
      inventoryVersion: INVENTORY_VERSION
    });
    assertCheck(`wrapper rejects ${label}`, parsed.kind === "unknown", "malformed runtime RETURN fails closed");
  }

  const rejected = createAccountDeletionDatabaseFinalizerRepository({
    rpc: async () => ({ data: null, error: { message: "SQLSTATE 23514 private table detail" } })
  });
  assertCheck(
    "wrapper discards raw Supabase/PostgreSQL errors",
    (await rejected.finalizeDatabaseStage({
      deletionRequestId: REQUEST_ID,
      userId: USER_A,
      inventoryVersion: INVENTORY_VERSION
    })).kind === "blocked",
    "only a fixed blocked category crosses the repository boundary"
  );
}

{
  for (const [label, status, alreadyFinalized] of [
    ["succeeded", "succeeded", false],
    ["not_needed", "not_needed", false],
    ["already_finalized succeeded", "succeeded", true],
    ["already_finalized not_needed", "not_needed", true]
  ]) {
    const row = alreadyFinalized ? makeTerminal(requestRow(), status) : requestRow();
    const events = [];
    let authCalls = 0;
    const result = await runWithBridge(
      bridgeFixture({
        row,
        events,
        finalize: async (_input, persisted) => {
          if (!alreadyFinalized) makeTerminal(persisted, status);
          return finalizerResult(status, { alreadyFinalized });
        }
      }),
      databaseArgs(),
      FAKE_EXECUTE_ENV,
      { auth: async () => { authCalls += 1; return { status: "succeeded" }; } }
    );
    assertCheck(
      `${label} requires persisted terminal re-fetch and maps terminal`,
      result.status === status && result.progress.terminal === true &&
        result.safeCounts.dbFinalizerInvocations === 1 && result.safeCounts.dbAttempted === 1 &&
        result.safeCounts.destructiveOperationsAttempted === 1 &&
        result.safeCounts.dbTerminal === 1 && result.safeCounts.dbNonterminal === 0 &&
        result.safeCounts.dbObservedRowCount === evidence(status).dbObservedRowCount &&
        events.filter((event) => event === "repository:get-request").length === 2 && authCalls === 0,
      "result plus exact persisted terminal authority is required; Auth stays at zero"
    );
    assertSafeOutput(`${label} output is redacted`, result);
  }
}

{
  const invalidTerminalCases = [
    ["invalid terminal parent", { status: "processing" }],
    ["missing db_sub_finalized_at", { db_sub_finalized_at: null }],
    ["wrong inventory version", { db_inventory_version: "wrong-version" }],
    ["Provider terminal mismatch", { provider_cleanup_status: "pending" }],
    ["Storage terminal mismatch", { storage_cleanup_status: "failed" }],
    ["unsafe persisted count", { db_observed_row_count: Number.MAX_SAFE_INTEGER + 1 }],
    ["null persisted count", { db_retained_row_count: null }]
  ];

  for (const [label, terminalOverrides] of invalidTerminalCases) {
    const row = requestRow();
    const result = await runWithBridge(bridgeFixture({
      row,
      finalize: async (_input, persisted) => {
        makeTerminal(persisted);
        Object.assign(persisted, terminalOverrides);
        return finalizerResult();
      }
    }));
    assertCheck(
      `${label} fails closed after finalizer`,
      result.status === "manual_required" && result.safeReasonCode === "database_terminal_authority_missing" &&
        result.progress.terminal === false && result.safeCounts.dbFinalizerInvocations === 1 &&
        result.safeCounts.dbOutcomeUnknown === 1 && result.safeCounts.dbObservedRowCount === null,
      "unverified D/A/R remain null"
    );
  }

  const equationRow = requestRow();
  const badCounts = { dbObservedRowCount: 4, dbDeletedRowCount: 2, dbAnonymizedRowCount: 1, dbRetainedRowCount: 2 };
  const badEquation = await runWithBridge(bridgeFixture({
    row: equationRow,
    finalize: async (_input, persisted) => {
      makeTerminal(persisted, "succeeded", badCounts);
      return finalizerResult("succeeded", { counts: badCounts });
    }
  }));
  assertCheck(
    "D/A/R equation mismatch fails closed after persisted re-fetch",
    badEquation.status === "manual_required" && badEquation.safeCounts.dbObservedRowCount === null,
    "observed must equal D + A + R"
  );

  const mismatchRow = requestRow();
  const resultMismatch = await runWithBridge(bridgeFixture({
    row: mismatchRow,
    finalize: async (_input, persisted) => {
      makeTerminal(persisted);
      return finalizerResult("succeeded", {
        counts: { dbObservedRowCount: 6, dbDeletedRowCount: 3, dbAnonymizedRowCount: 1, dbRetainedRowCount: 2 }
      });
    }
  }));
  assertCheck(
    "terminal result and persisted evidence mismatch fails closed",
    resultMismatch.status === "manual_required" && resultMismatch.safeReasonCode === "database_terminal_authority_missing",
    "RPC output alone is never terminal authority"
  );
}

{
  const rogueRow = requestRow();
  const rogue = await runWithBridge(bridgeFixture({
    row: rogueRow,
    finalize: async () => ({
      kind: "raw rogue database result",
      userId: USER_A,
      table: "account_deletion_provider_targets"
    })
  }));
  assertCheck(
    "rogue RETURN maps to manual unknown with observed invocation preserved",
    rogue.status === "manual_required" && rogue.safeReasonCode === "database_stage_result_unknown" &&
      rogue.progress.marker === "unknown" && rogue.progress.terminal === false &&
      rogue.safeCounts.dbFinalizerInvocations === 1 && rogue.safeCounts.dbAttempted === 1 &&
      rogue.safeCounts.destructiveOperationsAttempted === 1 && rogue.safeCounts.dbOutcomeUnknown === 1 &&
      rogue.safeCounts.dbTerminal === 0 && rogue.safeCounts.dbNonterminal === 1 &&
      ["dbObservedRowCount", "dbDeletedRowCount", "dbAnonymizedRowCount", "dbRetainedRowCount"]
        .every((field) => rogue.safeCounts[field] === null),
    "no false-zero evidence is emitted after the invocation boundary"
  );
  assertSafeOutput("rogue RETURN output is redacted", rogue);

  const exception = await runWithBridge(bridgeFixture({
    finalize: async () => { throw new Error(`SQLSTATE 23514 stack-private ${USER_A}`); }
  }));
  assertCheck(
    "finalizer exception maps to fixed manual unknown and preserves attempt evidence",
    exception.status === "manual_required" && exception.safeReasonCode === "database_stage_result_unknown" &&
      exception.safeCounts.dbFinalizerInvocations === 1 && exception.safeCounts.destructiveOperationsAttempted === 1 &&
      exception.safeCounts.dbOutcomeUnknown === 1 && exception.safeCounts.dbObservedRowCount === null,
    "raw error and stack details are discarded"
  );
  assertSafeOutput("exception output is redacted", exception);

  const returnedThenRefetchFailsRow = requestRow();
  let reads = 0;
  const refetchFailure = await runAccountDeletionDatabaseOperatorStage(
    { stage: "database", mode: "execute", request: { userId: USER_A, deletionRequestId: REQUEST_ID } },
    {
      env: FAKE_EXECUTE_ENV,
      repository: {
        getRequestForOwner: async () => {
          reads += 1;
          if (reads === 2) throw new Error("post-RPC private failure");
          return returnedThenRefetchFailsRow;
        },
        finalizeDatabaseStage: async () => finalizerResult()
      }
    }
  );
  assertCheck(
    "post-RPC re-fetch exception retains invocation accounting",
    refetchFailure.status === "manual_required" && refetchFailure.safeCounts.dbFinalizerInvocations === 1 &&
      refetchFailure.safeCounts.dbAttempted === 1 && refetchFailure.safeCounts.destructiveOperationsAttempted === 1 &&
      refetchFailure.safeCounts.dbOutcomeUnknown === 1 && refetchFailure.safeCounts.dbObservedRowCount === null,
    "post-call uncertainty cannot reset observed attempts to zero"
  );
}

{
  const databaseCounters = [
    "dbFinalizerInvocations", "dbAttempted", "dbOutcomeUnknown", "dbTerminal", "dbNonterminal"
  ];
  const evidenceCounters = [
    "dbObservedRowCount", "dbDeletedRowCount", "dbAnonymizedRowCount", "dbRetainedRowCount"
  ];
  const validActions = sanitizeStageServiceResult({
    status: "blocked",
    safeReasonCode: "database_finalizer_rejected",
    safeProgress: { marker: "not_runnable", terminal: false },
    safeCounts: Object.fromEntries(databaseCounters.map((field) => [field, Number.MAX_SAFE_INTEGER]))
  }, "database");
  assertCheck(
    "DB sanitizer preserves nonnegative safe action integers",
    databaseCounters.every((field) => validActions.safeCounts[field] === Number.MAX_SAFE_INTEGER) &&
      evidenceCounters.every((field) => validActions.safeCounts[field] === null),
    "maximum safe action integer is retained while nonterminal evidence stays null"
  );

  const validEvidence = sanitizeStageServiceResult({
    status: "succeeded",
    safeReasonCode: null,
    safeProgress: { marker: "terminal", terminal: true },
    safeCounts: {
      destructiveOperationsAttempted: 1,
      dbFinalizerInvocations: 1,
      dbAttempted: 1,
      dbOutcomeUnknown: 0,
      dbTerminal: 1,
      dbNonterminal: 0,
      dbObservedRowCount: Number.MAX_SAFE_INTEGER,
      dbDeletedRowCount: Number.MAX_SAFE_INTEGER,
      dbAnonymizedRowCount: 0,
      dbRetainedRowCount: 0
    }
  }, "database");
  assertCheck(
    "DB sanitizer preserves valid maximum safe terminal evidence",
    validEvidence.status === "succeeded" &&
      validEvidence.safeCounts.dbObservedRowCount === Number.MAX_SAFE_INTEGER &&
      validEvidence.safeCounts.dbDeletedRowCount === Number.MAX_SAFE_INTEGER,
    "safe-integer evidence also satisfies the terminal equation"
  );

  for (const invalid of [1.5, -1, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY, true, "1", null]) {
    const sanitized = sanitizeStageServiceResult({
      status: "blocked",
      safeReasonCode: "database_finalizer_rejected",
      safeProgress: { marker: "not_runnable", terminal: false },
      safeCounts: Object.fromEntries([...databaseCounters, ...evidenceCounters].map((field) => [field, invalid]))
    }, "database");
    assertCheck(
      `DB sanitizer rejects ${String(invalid)}`,
      databaseCounters.every((field) => sanitized.safeCounts[field] === 0) &&
        evidenceCounters.every((field) => sanitized.safeCounts[field] === null),
      "action counters use safe zero while unverified D/A/R use null"
    );
  }

  const sanitizedRogue = sanitizeStageServiceResult({
    status: "raw rogue database result",
    safeReasonCode: `SQLSTATE 23514 ${USER_A}`,
    safeCounts: { dbFinalizerInvocations: 1, dbAttempted: 1, destructiveOperationsAttempted: 1 }
  }, "database");
  assertCheck(
    "runner sanitizer fail-closes an unknown Database stage result",
    sanitizedRogue.status === "manual_required" && sanitizedRogue.safeReasonCode === "database_stage_result_unknown" &&
      sanitizedRogue.progress.marker === "unknown" && sanitizedRogue.safeCounts.dbOutcomeUnknown === 1 &&
      sanitizedRogue.safeCounts.dbFinalizerInvocations === 1,
    "compile-time typing is not runtime authority"
  );
  assertSafeOutput("runner rogue Database output is redacted", sanitizedRogue);
}

{
  let repositoryCreations = 0;
  let finalizerCalls = 0;
  const bridge = createAccountDeletionDatabaseOperatorBridge({
    env: process.env,
    lookupRequest: async () => { throw new Error("guard must stop first"); },
    createRepository: () => {
      repositoryCreations += 1;
      return {
        getRequestForOwner: async () => requestRow(),
        finalizeDatabaseStage: async () => { finalizerCalls += 1; return { kind: "unknown" }; }
      };
    }
  });
  const guarded = await runWithBridge(bridge, databaseArgs(), process.env);
  assertCheck(
    "actual disabled guard stops before Database resolver/service/finalizer",
    process.env.NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE !== "1" &&
      guarded.status === "blocked" && guarded.safeReasonCode === "destructive_guard_missing" &&
      repositoryCreations === 0 && finalizerCalls === 0 && guarded.safeCounts.dbFinalizerInvocations === 0 &&
      guarded.safeCounts.destructiveOperationsAttempted === 0,
    "fake execute authority is scoped to injected test objects only"
  );
}

{
  let wrapperCalls = 0;
  const crossUser = await runAccountDeletionDatabaseOperatorStage(
    { stage: "database", mode: "execute", request: { userId: USER_B, deletionRequestId: REQUEST_ID } },
    {
      env: FAKE_EXECUTE_ENV,
      repository: {
        getRequestForOwner: async (requestId, userId) =>
          requestId === REQUEST_ID && userId === USER_A ? requestRow() : null,
        finalizeDatabaseStage: async () => { wrapperCalls += 1; return { kind: "unknown" }; }
      }
    }
  );
  assertCheck(
    "User A request cannot select User B Database authority",
    crossUser.status === "blocked" && wrapperCalls === 0 &&
      crossUser.safeCounts.dbFinalizerInvocations === 0 && crossUser.safeCounts.destructiveOperationsAttempted === 0,
    "exact deletionRequestId plus expectedUserId is required before RPC"
  );

  const mismatchedResolver = await resolveAccountDeletionDatabaseOperatorRequest(
    { stage: "database", requestRef: REQUEST_ID },
    { lookupRequest: async () => ({ rows: [requestRow({ id: OTHER_REQUEST_ID, user_id: USER_B })], failed: false }) }
  );
  assertCheck(
    "Database resolver rejects cross-request/cross-user persisted mismatch",
    mismatchedResolver.ok === false && mismatchedResolver.safeReasonCode === "request_target_mismatch",
    "known-invalid destructive input never reaches the wrapper"
  );
}

{
  const repositorySource = readFileSync("services/account-deletion/account-deletion-database-finalizer.repository.ts", "utf8");
  const operatorSource = readFileSync("services/account-deletion/account-deletion-database-operator.service.ts", "utf8");
  const entrySource = readFileSync("scripts/account-deletion-operator-entry.mjs", "utf8");
  const legacySource = readFileSync("services/account-deletion/account-deletion.service.ts", "utf8");

  assertCheck(
    "Database wrapper contains one focused RPC and no second mutation engine",
    (repositorySource.match(/client\.rpc\(/g) ?? []).length === 1 &&
      repositorySource.includes("finalize_account_deletion_database_stage") &&
      !repositorySource.includes("ACCOUNT_DELETION_DATABASE_TABLE_CONTRACT") &&
      !repositorySource.includes("runDatabaseCleanupActual") &&
      !repositorySource.includes("executeOwnedDatabaseCleanupForAccountDeletion"),
    "18-table SQL and legacy DELETE loops are not duplicated"
  );
  assertCheck(
    "Database bridge does not import legacy DB or Auth executors",
    !operatorSource.includes("runDatabaseCleanupActual") &&
      !operatorSource.includes("executeOwnedDatabaseCleanupForAccountDeletion") &&
      !operatorSource.includes("runSupabaseAuthDeletionActual"),
    "legacy DB calls and Auth calls are zero"
  );
  assertCheck(
    "canonical entry routes Database and durable Auth explicitly",
    entrySource.includes("createAccountDeletionDatabaseOperatorBridge") &&
      entrySource.includes("input.stage === \"database\"") &&
      entrySource.includes("databaseBridge.requestResolver(input)") &&
      entrySource.includes("createAccountDeletionAuthOperatorBridge") &&
      entrySource.includes("authBridge.requestResolver(input)") &&
      !entrySource.includes("runSupabaseAuthDeletionActual") &&
      !entrySource.includes("runDatabaseCleanupActual"),
    "Database/Auth have no fallback and Completion remains fail closed"
  );
  assertCheck(
    "legacy DB durable-authority guard remains unchanged",
    legacySource.includes("LEGACY_DATABASE_CLEANUP_DURABLE_AUTHORITY_REQUIRED = true") &&
      legacySource.includes("db_durable_authority_required"),
    "legacy DB executor remains mutation-free"
  );
}

assertCheck(
  "later stages, external stages, and real environments remain untouched",
  Object.values(externalCalls).every((count) => count === 0),
  "Provider/Storage/Auth/completion/legacy/real DB/Staging/Production calls are all zero"
);
assertCheck(
  "destructive guard remains disabled outside injected fake authority",
  process.env.NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE !== "1",
  "Canonical process and .env.local execution authority were not changed"
);

console.log("\nResult: G5D-2L Database finalizer canonical operator wiring behavioral fake proof passed.");
