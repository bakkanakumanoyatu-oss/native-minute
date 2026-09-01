#!/usr/bin/env node

import {
  adaptAccountDeletionProviderOutcome,
  createAccountDeletionProviderOperatorBridge
} from "../services/account-deletion/account-deletion-provider-operator.service.ts";
import {
  parseArgs,
  runAccountDeletionOperator
} from "./account-deletion-operator-runner.mjs";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const REQUEST_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_REQUEST_ID = "33333333-3333-4333-8333-333333333333";
const ANONYMIZED_REF = `adr_${"a".repeat(32)}`;
const PROVIDER_ID = "voice_sensitive_provider_target";
const STORAGE_LOCATOR = "voice-samples/private/locator.wav";
const RAW_PROVIDER_RESPONSE = "raw provider response with private payload";
const DESTRUCTIVE_ENV = {
  NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE: "1"
};
const externalCalls = {
  liveProvider: 0,
  stagingMutation: 0
};

function assertCheck(label, condition, detail) {
  console.log(`- ${label}: ${condition ? "ok" : "failed"}${detail ? ` (${detail})` : ""}`);

  if (!condition) {
    throw new Error(label);
  }
}

function assertSafeOutput(label, value) {
  const output = JSON.stringify(value);
  const forbidden = [
    USER_ID,
    REQUEST_ID,
    OTHER_REQUEST_ID,
    ANONYMIZED_REF,
    PROVIDER_ID,
    STORAGE_LOCATOR,
    RAW_PROVIDER_RESPONSE,
    "private@example.com",
    "service-role-secret",
    "signed-private-url"
  ];

  assertCheck(
    label,
    forbidden.every((needle) => !output.includes(needle)),
    "operator output contains safe statuses, reasons, counts, and markers only"
  );
}

function executeArgs(stage = "provider", requestRef = REQUEST_ID) {
  const args = [
    "--stage",
    stage,
    "--request",
    requestRef,
    "--execute",
    "--proof",
    "docs/safe-proof-template.md",
    "--latest-dry-run-runnable",
    "--acknowledge-irreversible",
    "I_UNDERSTAND_ACCOUNT_DELETION_IS_IRREVERSIBLE"
  ];

  if (stage !== "provider") {
    args.push("--prior-stage-satisfied");
  }

  return parseArgs(args);
}

function makeActualResult(status, options = {}) {
  return {
    status,
    failureReasonCode: options.failureReasonCode ?? null,
    cleanup: {
      attempted: options.attempted ?? 0,
      succeeded: options.succeeded ?? 0,
      failed: options.failed ?? 0,
      notNeeded: options.notNeeded ?? 0,
      blocked: options.blocked ?? 0
    },
    deletionRequest: {
      id: REQUEST_ID,
      userId: USER_ID,
      email: "private@example.com"
    },
    providerVoiceId: PROVIDER_ID,
    storageLocator: STORAGE_LOCATOR,
    rawProviderResponse: RAW_PROVIDER_RESPONSE
  };
}

function makeLookup(
  events,
  rows = [
    {
      id: REQUEST_ID,
      user_id: USER_ID,
      status: "confirmed",
      provider_cleanup_status: "pending"
    }
  ]
) {
  return async (input) => {
    events.push(`lookup:${input.field}`);
    return { rows, failed: false };
  };
}

async function runWithBridge(parsed, bridge, env = DESTRUCTIVE_ENV) {
  return runAccountDeletionOperator(parsed, {
    env,
    requestResolver: bridge.requestResolver,
    stageServices: bridge.stageServices
  });
}

console.log("Native Minute G5D-1 provider-only operator bridge behavioral fake proof");
console.log("- provider adapter: fake only");
console.log("- Storage / DB / Auth / completion adapters: absent");
console.log("- real provider calls: 0");

{
  const events = [];
  const bridge = createAccountDeletionProviderOperatorBridge({
    env: {},
    lookupRequest: makeLookup(events),
    runProviderCleanupActual: async () => {
      events.push("provider-service");
      return makeActualResult("succeeded");
    }
  });
  const summary = await runWithBridge(executeArgs(), bridge, {});

  assertCheck(
    "destructive guard blocks before resolver and service",
    summary.status === "blocked" &&
      summary.safeReasonCode === "destructive_guard_missing" &&
      events.length === 0,
    "guard precedence prevents DB resolution and provider service reachability"
  );
  assertSafeOutput("guard-blocked output is redacted", summary);
}

{
  const events = [];
  const bridge = createAccountDeletionProviderOperatorBridge({
    env: DESTRUCTIVE_ENV,
    lookupRequest: async (input) => {
      events.push(`lookup:${input.field}:${input.value === REQUEST_ID ? "exact" : "wrong"}`);
      return {
        rows: [
          {
            id: REQUEST_ID,
            user_id: USER_ID,
            status: "confirmed",
            provider_cleanup_status: "pending"
          }
        ],
        failed: false
      };
    },
    runProviderCleanupActual: async (input) => {
      events.push(
        input.userId === USER_ID && input.deletionRequestId === REQUEST_ID
          ? "provider-service:exact"
          : "provider-service:wrong"
      );
      return makeActualResult("succeeded", { attempted: 1, succeeded: 1 });
    }
  });
  const summary = await runWithBridge(executeArgs(), bridge);

  assertCheck(
    "exact request is resolved before exact provider target is passed",
    summary.status === "succeeded" &&
      events.join(",") === "lookup:id:exact,provider-service:exact" &&
      summary.safeCounts.providerAttempted === 1 &&
      summary.safeCounts.providerSucceeded === 1,
    "external UUID is resolved once and only internal user/request ids reach the service"
  );
  assertSafeOutput("successful provider output is redacted", summary);
}

{
  const events = [];
  const bridge = createAccountDeletionProviderOperatorBridge({
    env: DESTRUCTIVE_ENV,
    lookupRequest: async (input) => {
      events.push(`lookup:${input.field}:${input.value === ANONYMIZED_REF ? "exact" : "wrong"}`);
      return {
        rows: [
          {
            id: REQUEST_ID,
            user_id: USER_ID,
            anonymized_user_ref: ANONYMIZED_REF,
            status: "confirmed",
            provider_cleanup_status: "succeeded"
          }
        ],
        failed: false
      };
    },
    runProviderCleanupActual: async (input) => {
      events.push(
        input.userId === USER_ID && input.deletionRequestId === REQUEST_ID
          ? "provider-service:exact"
          : "provider-service:wrong"
      );
      return makeActualResult("already_satisfied");
    }
  });
  const summary = await runWithBridge(executeArgs("provider", ANONYMIZED_REF), bridge);

  assertCheck(
    "opaque request reference resolves to exactly one internal target",
    summary.status === "already_satisfied" &&
      events.join(",") === "lookup:anonymized_user_ref:exact,provider-service:exact",
    "opaque reference is verified against the returned row before service invocation"
  );
  assertSafeOutput("opaque reference output is redacted", summary);
}

{
  let lookupCalls = 0;
  let providerCalls = 0;
  const bridge = createAccountDeletionProviderOperatorBridge({
    env: DESTRUCTIVE_ENV,
    lookupRequest: async () => {
      lookupCalls += 1;
      return { rows: [], failed: false };
    },
    runProviderCleanupActual: async () => {
      providerCalls += 1;
      return makeActualResult("succeeded");
    }
  });
  const invalid = await runWithBridge(executeArgs("provider", "not-a-request-reference"), bridge);
  const wrong = await runWithBridge(executeArgs("provider", OTHER_REQUEST_ID), bridge);

  assertCheck(
    "invalid and wrong references fail closed",
    invalid.status === "blocked" &&
      invalid.safeReasonCode === "request_ref_invalid" &&
      wrong.status === "blocked" &&
      wrong.safeReasonCode === "request_not_found" &&
      lookupCalls === 1 &&
      providerCalls === 0,
    "invalid syntax stops before lookup; exact but unknown UUID stops before provider service"
  );
  assertSafeOutput("invalid reference output is redacted", invalid);
  assertSafeOutput("wrong reference output is redacted", wrong);
}

{
  let providerCalls = 0;
  const bridge = createAccountDeletionProviderOperatorBridge({
    env: DESTRUCTIVE_ENV,
    lookupRequest: async () => ({
      rows: [{ id: OTHER_REQUEST_ID, user_id: USER_ID }],
      failed: false
    }),
    runProviderCleanupActual: async () => {
      providerCalls += 1;
      return makeActualResult("succeeded");
    }
  });
  const summary = await runWithBridge(executeArgs(), bridge);

  assertCheck(
    "resolver rejects a lookup result that does not match the external reference",
    summary.status === "blocked" &&
      summary.safeReasonCode === "request_target_mismatch" &&
      providerCalls === 0,
    "query construction alone is not trusted as target identity proof"
  );
  assertSafeOutput("mismatched lookup output is redacted", summary);
}

{
  let providerCalls = 0;
  const bridge = createAccountDeletionProviderOperatorBridge({
    env: DESTRUCTIVE_ENV,
    lookupRequest: async () => ({
      rows: [
        {
          id: REQUEST_ID,
          user_id: USER_ID,
          status: "completed",
          provider_cleanup_status: "succeeded"
        }
      ],
      failed: false
    }),
    runProviderCleanupActual: async () => {
      providerCalls += 1;
      return makeActualResult("already_satisfied");
    }
  });
  const summary = await runWithBridge(executeArgs(), bridge);

  assertCheck(
    "stale or non-runnable exact request is rejected before provider service",
    summary.status === "blocked" &&
      summary.safeReasonCode === "request_target_not_runnable" &&
      providerCalls === 0,
    "the resolver accepts only current provider-stage request/status authority"
  );
  assertSafeOutput("non-runnable request output is redacted", summary);
}

{
  let providerCalls = 0;
  const bridge = createAccountDeletionProviderOperatorBridge({
    env: DESTRUCTIVE_ENV,
    lookupRequest: async () => ({
      rows: [
        { id: REQUEST_ID, user_id: USER_ID },
        { id: OTHER_REQUEST_ID, user_id: USER_ID }
      ],
      failed: false
    }),
    runProviderCleanupActual: async () => {
      providerCalls += 1;
      return makeActualResult("succeeded");
    }
  });
  const summary = await runWithBridge(executeArgs("provider", ANONYMIZED_REF), bridge);

  assertCheck(
    "ambiguous opaque reference fails closed",
    summary.status === "blocked" &&
      summary.safeReasonCode === "request_target_ambiguous" &&
      providerCalls === 0,
    "the existing non-unique opaque-reference index is not treated as uniqueness authority"
  );
  assertSafeOutput("ambiguous reference output is redacted", summary);
}

{
  const calls = { storage: 0, database: 0, auth: 0, completion: 0, resolver: 0 };
  const bridge = createAccountDeletionProviderOperatorBridge({
    env: DESTRUCTIVE_ENV,
    lookupRequest: async () => {
      calls.resolver += 1;
      return {
        rows: [
          {
            id: REQUEST_ID,
            user_id: USER_ID,
            status: "confirmed",
            provider_cleanup_status: "pending"
          }
        ],
        failed: false
      };
    },
    runProviderCleanupActual: async () => makeActualResult("succeeded")
  });

  assertCheck(
    "provider is the only connected destructive stage",
    Object.keys(bridge.stageServices).join(",") === "provider",
    "later stage functions do not exist in G5D-1 wiring"
  );

  for (const stage of ["storage", "database", "auth"]) {
    const summary = await runWithBridge(executeArgs(stage), bridge);
    assertCheck(
      `${stage} stage is unreachable`,
      summary.status === "blocked" &&
        summary.safeReasonCode === "actual_service_not_connected_in_skeleton",
      "later stages stop before resolution"
    );
  }

  assertCheck(
    "Storage, DB/anonymization, Auth/completion call counts stay zero",
    calls.storage === 0 &&
      calls.database === 0 &&
      calls.auth === 0 &&
      calls.completion === 0 &&
      calls.resolver === 0,
    "later stage wiring and calls are absent"
  );
}

{
  const cases = [
    ["succeeded", null, "succeeded", null],
    ["not_needed", null, "not_needed", null],
    ["already_satisfied", null, "already_satisfied", null],
    ["failed", "elevenlabs_voice_delete_rate_limited", "failed", "provider_delete_rate_limited"],
    [
      "manual_required",
      "elevenlabs_voice_delete_not_found",
      "manual_required",
      "provider_target_absence_unverified"
    ],
    ["blocked", "deletion_request_id_mismatch", "blocked", "request_target_mismatch"],
    [
      "blocked",
      "provider_durable_authority_required",
      "blocked",
      "provider_durable_authority_required"
    ]
  ];

  for (const [serviceStatus, failureReasonCode, operatorStatus, safeReasonCode] of cases) {
    const adapted = adaptAccountDeletionProviderOutcome(
      makeActualResult(serviceStatus, {
        failureReasonCode,
        attempted: serviceStatus === "succeeded" ? 1 : 0,
        succeeded: serviceStatus === "succeeded" ? 1 : 0,
        notNeeded: serviceStatus === "not_needed" ? 1 : 0,
        blocked: serviceStatus === "blocked" ? 1 : 0
      })
    );

    assertCheck(
      `${serviceStatus} outcome mapping is explicit`,
      adapted.status === operatorStatus && adapted.safeReasonCode === safeReasonCode,
      "service failureReasonCode and cleanup are converted to operator-safe semantics"
    );
    assertSafeOutput(`${serviceStatus} adapter output is redacted`, adapted);
  }

  const unknownRawReason = adaptAccountDeletionProviderOutcome(
    makeActualResult("failed", {
      failureReasonCode: `${RAW_PROVIDER_RESPONSE}:${PROVIDER_ID}`,
      attempted: 1,
      failed: 1
    })
  );
  assertCheck(
    "unknown provider reason is not passed through",
    unknownRawReason.safeReasonCode === "provider_cleanup_failed",
    "only an explicit allowlist can reach operator safeReasonCode"
  );
  assertSafeOutput("unknown provider reason output is redacted", unknownRawReason);
}

{
  const events = [];
  const results = [
    makeActualResult("failed", {
      failureReasonCode: "elevenlabs_voice_delete_rate_limited",
      attempted: 2,
      succeeded: 1,
      failed: 1
    }),
    makeActualResult("manual_required", {
      failureReasonCode: "elevenlabs_voice_delete_not_found",
      attempted: 1,
      failed: 1
    })
  ];
  const bridge = createAccountDeletionProviderOperatorBridge({
    env: DESTRUCTIVE_ENV,
    lookupRequest: makeLookup(events),
    runProviderCleanupActual: async () => {
      events.push("provider-service");
      return results.shift();
    }
  });
  const first = await runWithBridge(executeArgs(), bridge);
  const retry = await runWithBridge(executeArgs(), bridge);

  assertCheck(
    "partial-success retry re-resolves and remains provider-only",
    first.status === "failed" &&
      first.safeCounts.providerAttempted === 2 &&
      first.safeCounts.providerSucceeded === 1 &&
      first.safeCounts.providerFailed === 1 &&
      retry.status === "manual_required" &&
      retry.safeReasonCode === "provider_target_absence_unverified" &&
      events.join(",") === "lookup:id,provider-service,lookup:id,provider-service",
    "retry does not infer completion and never advances to Storage/DB/Auth"
  );
  assertSafeOutput("partial-success output is redacted", first);
  assertSafeOutput("partial-success retry output is redacted", retry);
}

{
  const events = [];
  let serviceAttempt = 0;
  const bridge = createAccountDeletionProviderOperatorBridge({
    env: DESTRUCTIVE_ENV,
    lookupRequest: makeLookup(events),
    runProviderCleanupActual: async () => {
      serviceAttempt += 1;
      events.push("provider-service");

      if (serviceAttempt === 1) {
        throw new Error(`${RAW_PROVIDER_RESPONSE}:${USER_ID}:${REQUEST_ID}:${PROVIDER_ID}`);
      }

      return makeActualResult("manual_required", {
        failureReasonCode: "elevenlabs_voice_delete_not_found",
        attempted: 1,
        failed: 1
      });
    }
  });
  const lostResult = await runWithBridge(executeArgs(), bridge);
  const retry = await runWithBridge(executeArgs(), bridge);

  assertCheck(
    "status-write/result loss is fail-closed without false zero-attempt proof",
    lostResult.status === "manual_required" &&
      lostResult.safeReasonCode === "provider_stage_result_unknown" &&
      lostResult.safeCounts.destructiveOperationsAttempted === null &&
      lostResult.safeCounts.providerAttempted === null &&
      lostResult.safeCounts.providerSucceeded === null &&
      lostResult.safeCounts.providerFailed === null &&
      lostResult.safeCounts.providerOutcomeUnknown === 1 &&
      retry.status === "manual_required" &&
      events.join(",") === "lookup:id,provider-service,lookup:id,provider-service",
    "retry re-resolves exact request and cannot claim prior provider completion"
  );
  assertSafeOutput("unknown provider result output is redacted", lostResult);
  assertSafeOutput("unknown provider result retry output is redacted", retry);
}

assertCheck(
  "real provider and Staging mutation counts stay zero",
  externalCalls.liveProvider === 0 && externalCalls.stagingMutation === 0,
  "all provider service behavior above was injected; no real client, DB, or environment was used"
);

console.log("\nResult: G5D-1 provider-only operator bridge behavioral fake proof passed.");
