#!/usr/bin/env node

import { readFileSync } from "node:fs";
import {
  createAccountDeletionStorageOperatorBridge,
  resolveAccountDeletionStorageOperatorRequest,
  runAccountDeletionStorageOperatorStage
} from "../services/account-deletion/account-deletion-storage-operator.service.ts";
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
const COLLECTION_TOKEN = "55555555-5555-4555-8555-555555555555";
const STORAGE_OBJECT_KEY = `${USER_A}/private/storage-object.wav`;
const NOW = "2026-09-02T00:00:00.000Z";
const FAKE_EXECUTE_ENV = { NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE: "1" };
const calls = {
  realStorage: 0,
  liveProvider: 0,
  legacyStorage: 0,
  database: 0,
  auth: 0,
  completion: 0,
  stagingMutation: 0,
  productionMutation: 0
};

function assertCheck(label, condition, detail) {
  console.log(`- ${label}: ${condition ? "ok" : "failed"}${detail ? ` (${detail})` : ""}`);
  if (!condition) throw new Error(label);
}

function assertSafeOutput(label, value) {
  const output = JSON.stringify(value);
  const forbidden = [
    USER_A,
    USER_B,
    REQUEST_ID,
    OTHER_REQUEST_ID,
    ANONYMIZED_REF,
    STORAGE_OBJECT_KEY,
    "recordings",
    "private@example.com",
    "provider-private-id",
    "source-row-private-id",
    "fingerprint-private",
    "signed-private-url",
    "service-role-secret",
    "raw rogue storage result"
  ];
  assertCheck(label, forbidden.every((needle) => !output.includes(needle)), "raw identity, locator, and unknown values are absent");
}

function executeArgs({ priorStageSatisfied = true, requestRef = REQUEST_ID } = {}) {
  const args = [
    "--stage", "storage",
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
  const snapshotStatus = overrides.storage_snapshot_status ?? "sealed";
  const unsealed = snapshotStatus === "pending" || snapshotStatus === "collecting";
  return {
    id: REQUEST_ID,
    user_id: USER_A,
    anonymized_user_ref: ANONYMIZED_REF,
    status: "confirmed",
    provider_cleanup_status: "succeeded",
    provider_sub_finalized_at: NOW,
    storage_cleanup_status: "pending",
    storage_snapshot_version: "g5d-2e.account-storage.v1",
    storage_snapshot_status: snapshotStatus,
    storage_snapshot_seal_version: unsealed ? 0 : 1,
    storage_snapshot_collection_token: snapshotStatus === "collecting" ? COLLECTION_TOKEN : null,
    storage_snapshot_collection_started_at: snapshotStatus === "pending" ? null : NOW,
    storage_snapshot_sealed_at: unsealed ? null : NOW,
    storage_snapshot_fingerprint: unsealed ? null : "safe-aggregate",
    storage_snapshot_target_count: unsealed ? 0 : 1,
    storage_verified_absent_count: 0,
    storage_runner_lease_token: null,
    storage_runner_lease_expires_at: null,
    storage_sub_finalized_at: null,
    storage_locator_scrubbed_at: null,
    ...overrides
  };
}

function makeTerminal(row, status = "succeeded") {
  Object.assign(row, {
    storage_cleanup_status: status,
    storage_snapshot_status: "sealed",
    storage_snapshot_seal_version: 1,
    storage_snapshot_collection_token: null,
    storage_snapshot_collection_started_at: NOW,
    storage_snapshot_sealed_at: NOW,
    storage_snapshot_fingerprint: null,
    storage_snapshot_target_count: status === "not_needed" ? 0 : 1,
    storage_verified_absent_count: status === "not_needed" ? 0 : 1,
    storage_runner_lease_token: null,
    storage_runner_lease_expires_at: null,
    storage_sub_finalized_at: NOW,
    storage_locator_scrubbed_at: NOW
  });
  return row;
}

function lookupFixture(events, row) {
  return async ({ field }) => {
    events.push(`resolver:${field}`);
    return { rows: [row], failed: false };
  };
}

function repositoryFixture(events, row) {
  return {
    getRequestForOwner: async (requestId, userId) => {
      events.push("repository:get-request");
      return requestId === row.id && userId === row.user_id ? row : null;
    },
    beginStorageSnapshot: async (requestId, userId, collectionToken) => {
      events.push("repository:begin-snapshot");
      if (requestId !== row.id || userId !== row.user_id) throw new Error("cross-user");
      if (row.storage_snapshot_status === "pending") {
        Object.assign(row, {
          storage_snapshot_status: "collecting",
          storage_snapshot_collection_token: collectionToken,
          storage_snapshot_collection_started_at: NOW
        });
      }
      return row;
    },
    sealStorageSnapshot: async ({ deletionRequestId, userId, collectionToken }) => {
      events.push("repository:seal-snapshot");
      if (
        deletionRequestId !== row.id ||
        userId !== row.user_id ||
        collectionToken !== row.storage_snapshot_collection_token
      ) {
        throw new Error("seal mismatch");
      }
      Object.assign(row, {
        storage_snapshot_status: "sealed",
        storage_snapshot_seal_version: 1,
        storage_snapshot_collection_token: null,
        storage_snapshot_sealed_at: NOW,
        storage_snapshot_fingerprint: "safe-aggregate",
        storage_snapshot_target_count: 1,
        storage_verified_absent_count: 0
      });
      return row;
    }
  };
}

function storageAdapter(events, inventories = null) {
  let inventoryIndex = 0;
  const stable = {
    recordings: [],
    "script-audios": [],
    "voice-samples": [],
    "voice-consents": []
  };
  const listed = inventories ?? [stable, stable];

  return {
    listOwnedInventory: async () => {
      events.push("fake-storage:inventory");
      return listed[Math.min(inventoryIndex++, listed.length - 1)];
    },
    deleteObject: async () => {
      events.push("fake-storage:delete");
      return { kind: "request_succeeded" };
    },
    verifyObjectAbsence: async () => {
      events.push("fake-storage:verify");
      return { kind: "absent" };
    }
  };
}

function bridgeFixture({ row = requestRow(), events = [], runDurableStep, adapter, lookupRequest, repository } = {}) {
  return createAccountDeletionStorageOperatorBridge({
    env: FAKE_EXECUTE_ENV,
    lookupRequest: lookupRequest ?? lookupFixture(events, row),
    repository: repository ?? repositoryFixture(events, row),
    storageAdapter: adapter ?? storageAdapter(events),
    runDurableStep
  });
}

async function runWithBridge(parsed, bridge, env = FAKE_EXECUTE_ENV) {
  return runAccountDeletionOperator(parsed, {
    env,
    requestResolver: bridge.requestResolver,
    stageServices: bridge.stageServices
  });
}

console.log("Native Minute G5D-2G Storage durable canonical operator wiring behavioral fake proof");
console.log("- Storage adapter: injected fake only");
console.log("- Provider / DB / Auth / completion services: absent");
console.log("- real Storage / Staging / Production calls: 0");

{
  const storageNumericCounters = [
    "destructiveOperationsAttempted",
    "storageAttempted",
    "storageSealAttempts",
    "storageInventoryReads",
    "storageRunnerInvocations",
    "storageExternalActions",
    "storageDeleteActions",
    "storageVerificationActions",
    "storageOutcomeUnknown",
    "storageTerminal",
    "storageNonterminal"
  ];
  const sanitizeCounters = (value) => sanitizeStageServiceResult({
    status: "blocked",
    safeReasonCode: "storage_retry_later",
    safeProgress: {
      marker: "retry_later",
      terminal: false,
      retryable: true,
      manualReviewRequired: false
    },
    safeCounts: Object.fromEntries(storageNumericCounters.map((counter) => [counter, value]))
  });
  const validCases = [
    ["zero", 0],
    ["one", 1],
    ["maximum safe integer", Number.MAX_SAFE_INTEGER]
  ];
  const invalidCases = [
    ["unsafe finite integer", Number.MAX_SAFE_INTEGER + 1],
    ["maximum finite number", Number.MAX_VALUE],
    ["fraction", 1.5],
    ["negative", -1],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["negative Infinity", Number.NEGATIVE_INFINITY],
    ["boolean true", true],
    ["boolean false", false],
    ["string", "1"],
    ["object", { value: 1 }],
    ["null", null],
    ["undefined", undefined]
  ];

  for (const [label, value] of validCases) {
    const summary = sanitizeCounters(value);
    assertCheck(
      `Storage numeric counters preserve ${label}`,
      storageNumericCounters.every((counter) => summary.safeCounts[counter] === value),
      "all Storage evidence counters retain valid nonnegative safe integers"
    );
  }

  for (const [label, value] of invalidCases) {
    const summary = sanitizeCounters(value);
    assertCheck(
      `Storage numeric counters reject ${label}`,
      storageNumericCounters.every((counter) => {
        const expected = counter === "destructiveOperationsAttempted" && value === null ? null : 0;
        return summary.safeCounts[counter] === expected &&
          (expected === null || Number.isSafeInteger(summary.safeCounts[counter]));
      }),
      "all Storage evidence counters use their existing neutral fallback"
    );
  }

  const booleanProgress = sanitizeStageServiceResult({
    status: "succeeded",
    safeReasonCode: null,
    safeProgress: {
      marker: "terminal",
      terminal: true,
      retryable: false,
      manualReviewRequired: false
    },
    safeCounts: {
      storageTerminal: 1,
      storageNonterminal: 0
    }
  });
  assertCheck(
    "Storage numeric terminal counters stay separate from boolean progress flags",
    booleanProgress.safeCounts.storageTerminal === 1 &&
      booleanProgress.safeCounts.storageNonterminal === 0 &&
      booleanProgress.progress.terminal === true &&
      typeof booleanProgress.progress.terminal === "boolean" &&
      typeof booleanProgress.progress.retryable === "boolean" &&
      typeof booleanProgress.progress.manualReviewRequired === "boolean",
    "numeric counter sanitization does not coerce boolean progress state"
  );
}

{
  const observed = { resolver: 0, repository: 0, adapter: 0, runner: 0 };
  const bridge = createAccountDeletionStorageOperatorBridge({
    env: {},
    lookupRequest: async () => { observed.resolver += 1; return { rows: [], failed: false }; },
    createRepository: () => { observed.repository += 1; return repositoryFixture([], requestRow()); },
    createStorageAdapter: () => { observed.adapter += 1; return storageAdapter([]); },
    runDurableStep: async () => { observed.runner += 1; return { kind: "progressed" }; }
  });
  const summary = await runWithBridge(executeArgs(), bridge, {});
  assertCheck(
    "disabled guard blocks before resolver, repository, seal, runner, and adapter",
    summary.status === "blocked" && summary.safeReasonCode === "destructive_guard_missing" &&
      Object.values(observed).every((value) => value === 0),
    "canonical guard precedence is unchanged"
  );
  assertSafeOutput("guard-blocked output is redacted", summary);
}

{
  const cases = [
    ["pending", null],
    ["progressed", null],
    ["manual_required", null],
    ["unknown", null],
    ["succeeded", null],
    ["pending", NOW],
    ["failed", NOW]
  ];

  for (const [providerStatus, finalizedAt] of cases) {
    const events = [];
    const row = requestRow({
      storage_snapshot_status: "pending",
      provider_cleanup_status: providerStatus,
      provider_sub_finalized_at: finalizedAt
    });
    let repositoryCalls = 0;
    let adapterCalls = 0;
    let runnerCalls = 0;
    const bridge = createAccountDeletionStorageOperatorBridge({
      env: FAKE_EXECUTE_ENV,
      lookupRequest: lookupFixture(events, row),
      createRepository: () => { repositoryCalls += 1; return repositoryFixture(events, row); },
      createStorageAdapter: () => { adapterCalls += 1; return storageAdapter(events); },
      runDurableStep: async () => { runnerCalls += 1; return { kind: "progressed" }; }
    });
    const summary = await runWithBridge(executeArgs(), bridge);
    assertCheck(
      `Provider ${providerStatus}/${finalizedAt ? "finalized" : "not-finalized"} cannot authorize Storage`,
      summary.status === "blocked" && summary.safeReasonCode === "provider_terminal_not_persisted" &&
        repositoryCalls === 0 && adapterCalls === 0 && runnerCalls === 0 &&
        summary.safeCounts.destructiveOperationsAttempted === 0,
      "resolver advancement, seal, inventory, runner, and Storage action are zero"
    );
  }
}

{
  for (const providerStatus of ["succeeded", "not_needed"]) {
    const result = await resolveAccountDeletionStorageOperatorRequest(
      { stage: "storage", requestRef: REQUEST_ID },
      { lookupRequest: lookupFixture([], requestRow({
        storage_snapshot_status: "pending",
        provider_cleanup_status: providerStatus,
        provider_sub_finalized_at: NOW
      })) }
    );
    assertCheck(
      `persisted Provider ${providerStatus} plus sub-finalizer makes Storage eligible`,
      result.ok === true,
      "eligibility comes from the persisted request row"
    );
  }

  const events = [];
  const row = requestRow({
    storage_snapshot_status: "pending",
    provider_cleanup_status: "pending",
    provider_sub_finalized_at: null
  });
  const summary = await runWithBridge(executeArgs({ priorStageSatisfied: true }), bridgeFixture({ row, events }));
  assertCheck(
    "--prior-stage-satisfied alone cannot authorize Storage",
    summary.status === "blocked" && summary.safeReasonCode === "provider_terminal_not_persisted" &&
      events.filter((event) => event.startsWith("fake-storage:")).length === 0,
    "CLI assertion is not persistent authority"
  );
}

{
  for (const snapshotStatus of ["pending", "collecting"]) {
    const events = [];
    const row = requestRow({ storage_snapshot_status: snapshotStatus });
    let runnerCalls = 0;
    const bridge = bridgeFixture({
      row,
      events,
      runDurableStep: async () => { runnerCalls += 1; return { kind: "progressed" }; }
    });
    const summary = await runWithBridge(executeArgs(), bridge);
    assertCheck(
      `${snapshotStatus} snapshot performs one seal-only invocation`,
      summary.status === "blocked" &&
        summary.safeReasonCode === "storage_snapshot_sealed_continue_required" &&
        summary.progress.marker === "seal_only" &&
        summary.progress.terminal === false &&
        summary.safeCounts.storageSealAttempts === 1 &&
        summary.safeCounts.storageInventoryReads === 2 &&
        summary.safeCounts.storageRunnerInvocations === 0 &&
        summary.safeCounts.storageExternalActions === 0 &&
        summary.safeCounts.storageDeleteActions === 0 &&
        summary.safeCounts.storageVerificationActions === 0 &&
        runnerCalls === 0 &&
        events.filter((event) => event === "repository:seal-snapshot").length === 1,
      "writer fence and double inventory seal stop before runner/DELETE/info"
    );
    assertSafeOutput(`${snapshotStatus} seal-only output is redacted`, summary);
  }
}

{
  const events = [];
  const first = { recordings: [], "script-audios": [], "voice-samples": [], "voice-consents": [] };
  const second = { ...first, recordings: [STORAGE_OBJECT_KEY] };
  const row = requestRow({ storage_snapshot_status: "pending" });
  const summary = await runWithBridge(
    executeArgs(),
    bridgeFixture({ row, events, adapter: storageAdapter(events, [first, second]) })
  );
  assertCheck(
    "seal drift fails closed without later-stage work",
    summary.status === "manual_required" && summary.safeReasonCode === "storage_snapshot_seal_failed" &&
      summary.safeCounts.storageSealAttempts === 1 && summary.safeCounts.storageInventoryReads === 2 &&
      summary.safeCounts.storageRunnerInvocations === 0 && summary.safeCounts.storageExternalActions === 0 &&
      calls.database === 0 && calls.auth === 0 && calls.completion === 0,
    "failed double inventory never reaches runner or later stages"
  );
  assertSafeOutput("seal-failure output is redacted", summary);
}

{
  const cases = [
    [{ kind: "progressed" }, "delete", "blocked", "storage_progressed_continue_required", "progressed", true],
    [{ kind: "target_verified" }, "verify", "blocked", "storage_target_verified_continue_required", "target_verified", true],
    [{ kind: "retry_later" }, null, "blocked", "storage_retry_later", "retry_later", true],
    [{ kind: "busy" }, null, "blocked", "storage_busy", "busy", true],
    [{ kind: "stale_result" }, null, "blocked", "storage_stale_result", "stale_result", true],
    [{ kind: "not_runnable" }, null, "blocked", "storage_cleanup_not_runnable", "not_runnable", false],
    [{ kind: "manual_required" }, null, "manual_required", "storage_cleanup_manual_required", "manual_required", false]
  ];

  for (const [runnerResult, action, expectedStatus, expectedReason, expectedMarker, retryable] of cases) {
    const events = [];
    let runnerCalls = 0;
    const bridge = bridgeFixture({
      events,
      runDurableStep: async (_input, dependencies) => {
        runnerCalls += 1;
        if (action === "delete") {
          await dependencies.storageAdapter.deleteObject({ userId: USER_A, targetKind: "recording", objectKey: STORAGE_OBJECT_KEY });
        }
        if (action === "verify") {
          await dependencies.storageAdapter.verifyObjectAbsence({ userId: USER_A, targetKind: "recording", objectKey: STORAGE_OBJECT_KEY });
        }
        return runnerResult;
      }
    });
    const summary = await runWithBridge(executeArgs(), bridge);
    const expectedActions = action ? 1 : 0;
    assertCheck(
      `${runnerResult.kind} preserves durable nonterminal semantics`,
      runnerCalls === 1 && summary.status === expectedStatus && summary.safeReasonCode === expectedReason &&
        summary.progress.marker === expectedMarker && summary.progress.retryable === retryable &&
        summary.progress.terminal === false && summary.safeCounts.storageRunnerInvocations === 1 &&
        summary.safeCounts.storageExternalActions === expectedActions &&
        summary.safeCounts.storageDeleteActions === (action === "delete" ? 1 : 0) &&
        summary.safeCounts.storageVerificationActions === (action === "verify" ? 1 : 0) &&
        events.filter((event) => event === "fake-storage:delete").length === (action === "delete" ? 1 : 0) &&
        events.filter((event) => event === "fake-storage:verify").length === (action === "verify" ? 1 : 0),
      "one runner and no more than one target-level fake action"
    );
    assertSafeOutput(`${runnerResult.kind} output is redacted`, summary);
  }
}

{
  for (const [status, kind] of [["succeeded", "storage_stage_finalized"], ["not_needed", "already_finalized"]]) {
    const events = [];
    const row = status === "not_needed" ? makeTerminal(requestRow(), status) : requestRow();
    let runnerCalls = 0;
    const bridge = bridgeFixture({
      row,
      events,
      runDurableStep: async () => {
        runnerCalls += 1;
        if (kind === "storage_stage_finalized") makeTerminal(row, status);
        return { kind, status };
      }
    });
    const summary = await runWithBridge(executeArgs(), bridge);
    assertCheck(
      `persisted Storage ${status} sub-finalizer is terminal`,
      runnerCalls === 1 && summary.status === status && summary.safeReasonCode === null &&
        summary.progress.marker === "terminal" && summary.progress.terminal === true &&
        summary.safeCounts.storageTerminal === 1 && summary.safeCounts.storageExternalActions === 0 &&
        calls.database === 0 && calls.auth === 0 && calls.completion === 0,
      "terminal Storage stops before DB/Auth/completion"
    );
    assertSafeOutput(`terminal ${status} output is redacted`, summary);
  }

  const row = requestRow();
  const spoofed = await runWithBridge(
    executeArgs(),
    bridgeFixture({ row, runDurableStep: async () => ({ kind: "storage_stage_finalized", status: "succeeded" }) })
  );
  assertCheck(
    "runner terminal return without persisted sub-finalizer fails closed",
    spoofed.status === "manual_required" && spoofed.safeReasonCode === "storage_terminal_authority_missing" &&
      spoofed.progress.marker === "unknown" && spoofed.progress.terminal === false &&
      spoofed.safeCounts.storageOutcomeUnknown === 1 && spoofed.safeCounts.storageTerminal === 0,
    "DELETE or runner output alone is never terminal authority"
  );
}

{
  const events = [];
  const bridge = bridgeFixture({
    events,
    runDurableStep: async (_input, dependencies) => {
      await dependencies.storageAdapter.deleteObject({ userId: USER_A, targetKind: "recording", objectKey: STORAGE_OBJECT_KEY });
      await dependencies.storageAdapter.verifyObjectAbsence({ userId: USER_A, targetKind: "recording", objectKey: STORAGE_OBJECT_KEY });
      return { kind: "progressed" };
    }
  });
  const summary = await runWithBridge(executeArgs(), bridge);
  assertCheck(
    "operator wrapper prevents a second target-level Storage action",
    summary.status === "manual_required" && summary.safeReasonCode === "storage_action_limit_exceeded" &&
      summary.safeCounts.storageExternalActions === 1 && summary.safeCounts.storageDeleteActions === 1 &&
      summary.safeCounts.storageVerificationActions === 0 &&
      events.filter((event) => event.startsWith("fake-storage:")).length === 1,
    "DELETE never falls through to same-invocation info verification"
  );
  assertSafeOutput("action-limit output is redacted", summary);
}

{
  const cases = [
    ["rogue return before action", false, false],
    ["rogue return after action", true, false],
    ["exception before action", false, true],
    ["exception after action", true, true]
  ];

  for (const [label, performAction, shouldThrow] of cases) {
    const events = [];
    const bridge = bridgeFixture({
      events,
      runDurableStep: async (_input, dependencies) => {
        if (performAction) {
          await dependencies.storageAdapter.deleteObject({ userId: USER_A, targetKind: "recording", objectKey: STORAGE_OBJECT_KEY });
        }
        if (shouldThrow) throw new Error(`raw rogue storage result:${STORAGE_OBJECT_KEY}`);
        return {
          kind: "rogue_runtime_result",
          rawUnknown: "raw rogue storage result",
          bucket: "recordings",
          objectKey: STORAGE_OBJECT_KEY,
          userId: USER_A,
          requestId: REQUEST_ID
        };
      }
    });
    const summary = await runWithBridge(executeArgs(), bridge);
    const expectedActions = performAction ? 1 : 0;
    assertCheck(
      `${label} maps to safe unknown without false-zero evidence`,
      summary.status === "manual_required" && summary.safeReasonCode === "storage_stage_result_unknown" &&
        summary.progress.marker === "unknown" && summary.progress.terminal === false &&
        summary.progress.manualReviewRequired === true && summary.safeCounts.storageOutcomeUnknown === 1 &&
        summary.safeCounts.storageExternalActions === expectedActions &&
        summary.safeCounts.storageAttempted === expectedActions &&
        summary.safeCounts.destructiveOperationsAttempted === expectedActions &&
        summary.safeCounts.storageDeleteActions === expectedActions &&
        summary.safeCounts.storageTerminal === 0,
      "observed action is preserved and an unobserved action is never guessed"
    );
    assertSafeOutput(`${label} output is redacted`, summary);
  }
}

{
  const events = [];
  const row = requestRow();
  const crossUser = await runAccountDeletionStorageOperatorStage(
    {
      stage: "storage",
      mode: "execute",
      request: { userId: USER_B, deletionRequestId: REQUEST_ID }
    },
    {
      env: FAKE_EXECUTE_ENV,
      repository: repositoryFixture(events, row),
      storageAdapter: storageAdapter(events),
      runDurableStep: async () => { throw new Error("runner must not run"); }
    }
  );
  assertCheck(
    "User A request cannot resolve User B Storage authority",
    crossUser.status === "blocked" && crossUser.safeReasonCode === "storage_cleanup_not_runnable" &&
      crossUser.safeCounts.storageRunnerInvocations === 0 && crossUser.safeCounts.storageExternalActions === 0 &&
      events.filter((event) => event.startsWith("fake-storage:")).length === 0,
    "repository exact request/owner lookup fails closed"
  );

  const mismatched = await resolveAccountDeletionStorageOperatorRequest(
    { stage: "storage", requestRef: REQUEST_ID },
    { lookupRequest: async () => ({ rows: [requestRow({ id: OTHER_REQUEST_ID, user_id: USER_B })], failed: false }) }
  );
  assertCheck(
    "cross-request lookup mismatch fails closed",
    mismatched.ok === false && mismatched.safeReasonCode === "request_target_mismatch",
    "no cross-user stage authority is returned"
  );
  assertSafeOutput("cross-user output is redacted", crossUser);
}

{
  const operatorSource = readFileSync("services/account-deletion/account-deletion-storage-operator.service.ts", "utf8");
  const legacySource = readFileSync("services/account-deletion/account-deletion.service.ts", "utf8");
  const entrySource = readFileSync("scripts/account-deletion-operator-entry.mjs", "utf8");
  assertCheck(
    "Storage operator uses only the durable repository, runner, seal, and adapter authorities",
    operatorSource.includes("runAccountDeletionStorageDurableStep") &&
      operatorSource.includes("sealAccountDeletionStorageSnapshot") &&
      operatorSource.includes("createAccountDeletionStorageDurableRepository") &&
      operatorSource.includes("createAccountDeletionStorageAdapter") &&
      !operatorSource.includes("runStorageCleanupActual") &&
      !operatorSource.includes(".remove(") && !operatorSource.includes(".info("),
    "no direct Storage SDK or legacy aggregate executor is introduced"
  );
  assertCheck(
    "legacy Storage aggregate executor remains fail-closed",
    legacySource.includes("const LEGACY_STORAGE_CLEANUP_DURABLE_AUTHORITY_REQUIRED = true") &&
      legacySource.includes('failureReasonCode: "storage_durable_authority_required"'),
    "legacy listing/remove/status mutation path remains unreachable"
  );
  assertCheck(
    "canonical entry keeps Provider and Storage bridges while adding focused Database routing",
    entrySource.includes("createAccountDeletionProviderOperatorBridge") &&
      entrySource.includes("createAccountDeletionStorageOperatorBridge") &&
      entrySource.includes("createAccountDeletionDatabaseOperatorBridge") &&
      entrySource.includes("...providerBridge.stageServices") &&
      entrySource.includes("...storageBridge.stageServices") &&
      entrySource.includes("...databaseBridge.stageServices") &&
      !entrySource.includes("runDatabaseCleanupActual") &&
      !entrySource.includes("runSupabaseAuthDeletionActual"),
    "legacy DB/Auth/completion executors remain unavailable"
  );
}

assertCheck(
  "destructive guard remains disabled outside the injected fake environment",
  process.env.NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE !== "1",
  "no environment setting was changed"
);
assertCheck(
  "real Provider, real Storage, legacy, DB, Auth, completion, Staging, and Production calls stay zero",
  Object.values(calls).every((value) => value === 0),
  "all behavioral execution used injected local fakes"
);

console.log("\nResult: G5D-2G Storage durable canonical operator wiring behavioral fake proof passed.");
