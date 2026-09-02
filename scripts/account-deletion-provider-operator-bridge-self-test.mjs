#!/usr/bin/env node

import { readFileSync } from "node:fs";
import {
  createAccountDeletionProviderOperatorBridge
} from "../services/account-deletion/account-deletion-provider-operator.service.ts";
import { parseArgs, runAccountDeletionOperator } from "./account-deletion-operator-runner.mjs";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const REQUEST_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_REQUEST_ID = "33333333-3333-4333-8333-333333333333";
const ANONYMIZED_REF = `adr_${"a".repeat(32)}`;
const PROVIDER_ID = "voice_sensitive_provider_target";
const DESTRUCTIVE_ENV = { NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE: "1" };
const externalCalls = { liveProvider: 0, stagingMutation: 0, storage: 0, database: 0, auth: 0, completion: 0 };

function assertCheck(label, condition, detail) {
  console.log(`- ${label}: ${condition ? "ok" : "failed"}${detail ? ` (${detail})` : ""}`);
  if (!condition) throw new Error(label);
}

function assertSafeOutput(label, value) {
  const output = JSON.stringify(value);
  const forbidden = [
    USER_ID,
    REQUEST_ID,
    OTHER_REQUEST_ID,
    ANONYMIZED_REF,
    PROVIDER_ID,
    "private@example.com",
    "voice-samples/private/locator.wav",
    "raw provider response with private payload",
    "service-role-secret",
    "signed-private-url"
  ];
  assertCheck(label, forbidden.every((needle) => !output.includes(needle)), "only safe progress, counts, and reason codes remain");
}

function executeArgs(stage = "provider", requestRef = REQUEST_ID) {
  const args = [
    "--stage", stage,
    "--request", requestRef,
    "--execute",
    "--proof", "docs/safe-proof-template.md",
    "--latest-dry-run-runnable",
    "--acknowledge-irreversible", "I_UNDERSTAND_ACCOUNT_DELETION_IS_IRREVERSIBLE"
  ];
  if (stage !== "provider") args.push("--prior-stage-satisfied");
  return parseArgs(args);
}

function requestLookup(events, row = {}) {
  return async (input) => {
    events.push(`lookup:${input.field}`);
    return {
      rows: [{
        id: REQUEST_ID,
        user_id: USER_ID,
        anonymized_user_ref: ANONYMIZED_REF,
        status: "confirmed",
        provider_cleanup_status: "pending",
        ...row
      }],
      failed: false
    };
  };
}

function requestRow(snapshotStatus = "sealed") {
  return {
    id: REQUEST_ID,
    user_id: USER_ID,
    status: "confirmed",
    provider_cleanup_status: "pending",
    provider_snapshot_version: "g5d-2a.account-provider.v1",
    provider_snapshot_status: snapshotStatus,
    provider_snapshot_seal_version: snapshotStatus === "sealed" ? 1 : 0,
    provider_snapshot_sealed_at: snapshotStatus === "sealed" ? "2026-09-02T00:00:00.000Z" : null
  };
}

function repositoryFixture(events, snapshotStatus = "sealed") {
  const row = requestRow(snapshotStatus);
  return {
    getRequestForOwner: async (requestId, userId) => {
      events.push("repository:get-request");
      return requestId === REQUEST_ID && userId === USER_ID ? row : null;
    },
    sealProviderSnapshot: async () => {
      events.push("repository:seal-snapshot");
      Object.assign(row, {
        provider_snapshot_status: "sealed",
        provider_snapshot_seal_version: 1,
        provider_snapshot_sealed_at: "2026-09-02T00:00:00.000Z"
      });
      return row;
    }
  };
}

function providerAdapter(events) {
  return {
    deleteVoice: async () => {
      events.push("fake-provider:delete");
      return { kind: "deleted" };
    },
    reconcileVoiceAbsence: async () => {
      events.push("fake-provider:get");
      return { kind: "verified_absent" };
    }
  };
}

async function runWithBridge(parsed, bridge, env = DESTRUCTIVE_ENV) {
  return runAccountDeletionOperator(parsed, {
    env,
    requestResolver: bridge.requestResolver,
    stageServices: bridge.stageServices
  });
}

console.log("Native Minute G5D-2B provider durable canonical operator wiring behavioral fake proof");
console.log("- provider adapter: injected fake only");
console.log("- Storage / DB / Auth / completion adapters: absent");
console.log("- real provider / Staging calls: 0");

{
  const calls = { resolver: 0, repositoryFactory: 0, adapterFactory: 0, runner: 0 };
  const bridge = createAccountDeletionProviderOperatorBridge({
    env: {},
    lookupRequest: async () => { calls.resolver += 1; return { rows: [], failed: false }; },
    createRepository: () => { calls.repositoryFactory += 1; return repositoryFixture([]); },
    createProviderAdapter: () => { calls.adapterFactory += 1; return providerAdapter([]); },
    runDurableStep: async () => { calls.runner += 1; return { kind: "progressed" }; }
  });
  const summary = await runWithBridge(executeArgs(), bridge, {});
  assertCheck(
    "guard disabled blocks before resolver, repository, runner, and adapter",
    summary.status === "blocked" && summary.safeReasonCode === "destructive_guard_missing" && Object.values(calls).every((value) => value === 0),
    "provider work and external action are unreachable"
  );
  assertSafeOutput("guard-blocked output is redacted", summary);
}

{
  for (const [requestRef, expectedField] of [[REQUEST_ID, "id"], [ANONYMIZED_REF, "anonymized_user_ref"]]) {
    const events = [];
    const bridge = createAccountDeletionProviderOperatorBridge({
      env: DESTRUCTIVE_ENV,
      lookupRequest: requestLookup(events),
      repository: repositoryFixture(events, "pending"),
      createProviderAdapter: () => { throw new Error("provider adapter must not be created while sealing"); },
      runDurableStep: async () => { throw new Error("runner must not run while sealing"); }
    });
    const summary = await runWithBridge(executeArgs("provider", requestRef), bridge);
    assertCheck(
      `exact ${expectedField} target resolves and seals only`,
      summary.status === "blocked" &&
        summary.safeReasonCode === "provider_snapshot_sealed_continue_required" &&
        summary.progress.marker === "seal_only" &&
        summary.progress.terminal === false &&
        summary.progress.retryable === true &&
        summary.safeCounts.providerSnapshotSeals === 1 &&
        summary.safeCounts.providerDurableRunnerCalls === 0 &&
        summary.safeCounts.providerExternalActions === 0 &&
        events.join(",") === `lookup:${expectedField},repository:get-request,repository:seal-snapshot`,
      "the sealing invocation stops before DELETE/GET"
    );
    assertSafeOutput(`${expectedField} seal-only output is redacted`, summary);
  }
}

{
  let providerWorkCalls = 0;
  const base = {
    env: DESTRUCTIVE_ENV,
    repository: repositoryFixture([]),
    providerAdapter: providerAdapter([]),
    runDurableStep: async () => { providerWorkCalls += 1; return { kind: "progressed" }; }
  };
  const invalid = await runWithBridge(executeArgs("provider", "not-a-request-reference"), createAccountDeletionProviderOperatorBridge({ ...base, lookupRequest: requestLookup([]) }));
  const missing = await runWithBridge(executeArgs(), createAccountDeletionProviderOperatorBridge({ ...base, lookupRequest: async () => ({ rows: [], failed: false }) }));
  const ambiguous = await runWithBridge(executeArgs("provider", ANONYMIZED_REF), createAccountDeletionProviderOperatorBridge({
    ...base,
    lookupRequest: async () => ({ rows: [
      { id: REQUEST_ID, user_id: USER_ID, anonymized_user_ref: ANONYMIZED_REF },
      { id: OTHER_REQUEST_ID, user_id: USER_ID, anonymized_user_ref: ANONYMIZED_REF }
    ], failed: false })
  }));
  const stale = await runWithBridge(executeArgs(), createAccountDeletionProviderOperatorBridge({
    ...base,
    lookupRequest: requestLookup([], { status: "completed", provider_cleanup_status: "succeeded" })
  }));
  assertCheck(
    "invalid, missing, ambiguous, and stale targets fail closed",
    invalid.safeReasonCode === "request_ref_invalid" && missing.safeReasonCode === "request_not_found" &&
      ambiguous.safeReasonCode === "request_target_ambiguous" && stale.safeReasonCode === "request_target_not_runnable" && providerWorkCalls === 0,
    "no durable/provider work follows an unresolved target"
  );
  for (const value of [invalid, missing, ambiguous, stale]) assertSafeOutput("resolver failure output is redacted", value);
}

{
  const cases = [
    [{ kind: "progressed" }, "blocked", "provider_progressed_continue_required", "progressed", true],
    [{ kind: "target_verified" }, "blocked", "provider_target_verified_continue_required", "target_verified", true],
    [{ kind: "retry_later" }, "blocked", "provider_retry_later", "retry_later", true],
    [{ kind: "busy" }, "blocked", "provider_busy", "busy", true],
    [{ kind: "stale_result" }, "blocked", "provider_stale_result", "stale_result", true],
    [{ kind: "not_runnable" }, "blocked", "provider_cleanup_not_runnable", "not_runnable", false],
    [{ kind: "manual_required" }, "manual_required", "provider_cleanup_manual_required", "manual_required", false],
    [{ kind: "provider_stage_finalized", status: "succeeded" }, "succeeded", null, "terminal", false],
    [{ kind: "already_finalized", status: "not_needed" }, "not_needed", null, "terminal", false]
  ];

  for (const [runnerResult, expectedStatus, expectedReason, expectedMarker, retryable] of cases) {
    const events = [];
    let runnerCalls = 0;
    const bridge = createAccountDeletionProviderOperatorBridge({
      env: DESTRUCTIVE_ENV,
      lookupRequest: requestLookup(events),
      repository: repositoryFixture(events),
      providerAdapter: providerAdapter(events),
      runDurableStep: async (_input, dependencies) => {
        runnerCalls += 1;
        if (runnerResult.kind === "progressed") await dependencies.providerAdapter.deleteVoice({ providerResourceId: PROVIDER_ID });
        if (runnerResult.kind === "target_verified") await dependencies.providerAdapter.reconcileVoiceAbsence({ providerResourceId: PROVIDER_ID });
        return runnerResult;
      }
    });
    const summary = await runWithBridge(executeArgs(), bridge);
    const expectedActions = ["progressed", "target_verified"].includes(runnerResult.kind) ? 1 : 0;
    assertCheck(
      `${runnerResult.kind} maps without false terminal success`,
      runnerCalls === 1 && summary.status === expectedStatus && summary.safeReasonCode === expectedReason &&
        summary.progress.marker === expectedMarker && summary.progress.retryable === retryable &&
        summary.progress.terminal === ["succeeded", "not_needed"].includes(expectedStatus) &&
        summary.safeCounts.providerDurableRunnerCalls === 1 && summary.safeCounts.providerExternalActions === expectedActions,
      "one durable runner call and at most one fake provider action"
    );
    assertSafeOutput(`${runnerResult.kind} output is redacted`, summary);
  }
}

{
  const events = [];
  const bridge = createAccountDeletionProviderOperatorBridge({
    env: DESTRUCTIVE_ENV,
    lookupRequest: requestLookup(events),
    repository: repositoryFixture(events),
    providerAdapter: providerAdapter(events),
    runDurableStep: async (_input, dependencies) => {
      await dependencies.providerAdapter.deleteVoice({ providerResourceId: PROVIDER_ID });
      await dependencies.providerAdapter.reconcileVoiceAbsence({ providerResourceId: PROVIDER_ID });
      return { kind: "progressed" };
    }
  });
  const summary = await runWithBridge(executeArgs(), bridge);
  assertCheck(
    "operator wrapper prevents a second external provider action",
    summary.status === "manual_required" && summary.safeReasonCode === "provider_action_limit_exceeded" &&
      summary.safeCounts.providerExternalActions === 1 && events.filter((event) => event.startsWith("fake-provider:")).length === 1,
    "unexpected second adapter invocation fails closed before the underlying fake provider"
  );
  assertSafeOutput("action-limit output is redacted", summary);
}

{
  const bridge = createAccountDeletionProviderOperatorBridge({
    env: DESTRUCTIVE_ENV,
    lookupRequest: requestLookup([]),
    repository: repositoryFixture([]),
    providerAdapter: providerAdapter([]),
    runDurableStep: async (_input, dependencies) => {
      await dependencies.providerAdapter.deleteVoice({ providerResourceId: PROVIDER_ID });
      throw new Error(`raw provider response:${USER_ID}:${REQUEST_ID}:${PROVIDER_ID}`);
    }
  });
  const summary = await runWithBridge(executeArgs(), bridge);
  assertCheck(
    "unknown runner result fails closed without false zero-outcome proof",
      summary.status === "manual_required" && summary.safeReasonCode === "provider_stage_result_unknown" &&
      summary.progress.marker === "unknown" && summary.safeCounts.providerOutcomeUnknown === 1 &&
      summary.safeCounts.providerExternalActions === 1 && summary.safeCounts.destructiveOperationsAttempted === 1,
    "raw exception detail is discarded without claiming a false zero provider attempt"
  );
  assertSafeOutput("unknown result output is redacted", summary);
}

{
  const events = [];
  const bridge = createAccountDeletionProviderOperatorBridge({
    env: DESTRUCTIVE_ENV,
    lookupRequest: requestLookup(events),
    repository: repositoryFixture(events),
    providerAdapter: providerAdapter(events),
    runDurableStep: async (_input, dependencies) => {
      await dependencies.providerAdapter.deleteVoice({ providerResourceId: PROVIDER_ID });
      return {
        kind: "unrecognized_runtime_result",
        rawProviderResponse: "raw provider response with private payload",
        providerResourceId: PROVIDER_ID,
        userId: USER_ID,
        deletionRequestId: REQUEST_ID
      };
    }
  });
  const summary = await runWithBridge(executeArgs(), bridge);
  assertCheck(
    "returned unknown result preserves observed provider action evidence",
    summary.status === "manual_required" &&
      summary.safeReasonCode === "provider_stage_result_unknown" &&
      summary.progress.marker === "unknown" &&
      summary.progress.terminal === false &&
      summary.progress.manualReviewRequired === true &&
      summary.safeCounts.providerOutcomeUnknown === 1 &&
      summary.safeCounts.providerExternalActions === 1 &&
      summary.safeCounts.providerAttempted === 1 &&
      summary.safeCounts.destructiveOperationsAttempted === 1 &&
      events.filter((event) => event.startsWith("fake-provider:")).length === 1 &&
      Object.keys(bridge.stageServices).join(",") === "provider",
    "runtime mapping fail-closes without false zero evidence or a second/later-stage action"
  );
  assertSafeOutput("returned unknown runtime result is redacted", summary);
}

{
  const events = [];
  const bridge = createAccountDeletionProviderOperatorBridge({
    env: DESTRUCTIVE_ENV,
    lookupRequest: requestLookup(events),
    repository: repositoryFixture(events),
    providerAdapter: providerAdapter(events),
    runDurableStep: async () => ({ kind: "provider_stage_finalized", status: "succeeded" })
  });
  assertCheck("provider is the only connected destructive stage", Object.keys(bridge.stageServices).join(",") === "provider");
  for (const stage of ["storage", "database", "auth"]) {
    const summary = await runWithBridge(executeArgs(stage), bridge);
    assertCheck(`${stage} remains unreachable`, summary.status === "blocked" && summary.safeReasonCode === "actual_service_not_connected_in_skeleton");
  }
  assertCheck(
    "later-stage calls remain zero",
    externalCalls.storage === 0 && externalCalls.database === 0 && externalCalls.auth === 0 && externalCalls.completion === 0,
    "terminal Provider result does not auto-start a later stage"
  );
}

{
  const source = readFileSync("services/account-deletion/account-deletion-provider-operator.service.ts", "utf8");
  assertCheck(
    "canonical bridge no longer references the legacy aggregate executor",
    !source.includes("runElevenLabsProviderCleanupActual") && source.includes("runAccountDeletionProviderDurableStep"),
    "legacy executor remains separately fail-closed"
  );
}

assertCheck(
  "real provider and Staging mutation counts stay zero",
  externalCalls.liveProvider === 0 && externalCalls.stagingMutation === 0,
  "all behavior used injected fakes"
);

console.log("\nResult: G5D-2B provider durable canonical operator wiring behavioral fake proof passed.");
