#!/usr/bin/env node

import { readFileSync } from "node:fs";
import {
  ACCOUNT_DELETION_COMPLETION_EXPIRY_MS,
  createAccountDeletionCompletionRepository
} from "../services/account-deletion/account-deletion-completion.repository.ts";
import {
  createAccountDeletionCompletionOperatorBridge,
  resolveAccountDeletionCompletionOperatorRequest,
  runAccountDeletionCompletionOperatorStage
} from "../services/account-deletion/account-deletion-completion-operator.service.ts";
import {
  parseArgs,
  runAccountDeletionOperator,
  sanitizeStageServiceResult
} from "./account-deletion-operator-runner.mjs";

const REQUEST_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_REQUEST_ID = "44444444-4444-4444-8444-444444444444";
const ANONYMIZED_REF = `adr_${"a".repeat(32)}`;
const AUTH_AT = "2026-09-03T23:50:00.000Z";
const COMPLETED_AT = "2026-09-04T00:00:00.000Z";
const EXPIRES_AT = "2026-12-03T00:00:00.000Z";
const REWRITTEN_COMPLETED_AT = "2026-09-05T00:00:00.000Z";
const REWRITTEN_EXPIRES_AT = "2026-12-04T00:00:00.000Z";
const FAKE_EXECUTE_ENV = { NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE: "1" };

const forbiddenOutput = [
  REQUEST_ID,
  OTHER_REQUEST_ID,
  ANONYMIZED_REF,
  "private@example.com",
  "provider-secret-locator",
  "private-bucket/private-key",
  "raw metadata sentinel",
  "SQLSTATE XX000 private detail",
  "raw completion row sentinel",
  "service-role-secret",
  "stack-private"
];

function assertCheck(label, condition, detail) {
  console.log(`- ${label}: ${condition ? "ok" : "failed"}${detail ? ` (${detail})` : ""}`);
  if (!condition) throw new Error(label);
}

function assertSafeOutput(label, value) {
  const output = JSON.stringify(value);
  assertCheck(
    label,
    forbiddenOutput.every((needle) => !output.includes(needle)),
    "raw identity, locator, metadata, SQL, credentials, and rows are absent"
  );
}

function completionArgs({ requestRef = REQUEST_ID, priorStageSatisfied = true } = {}) {
  const args = [
    "--stage", "completion",
    "--request", requestRef,
    "--execute",
    "--proof", "docs/safe-proof-template.md",
    "--latest-dry-run-runnable",
    "--acknowledge-irreversible", "I_UNDERSTAND_ACCOUNT_DELETION_IS_IRREVERSIBLE"
  ];
  if (priorStageSatisfied) args.push("--prior-stage-satisfied");
  return parseArgs(args);
}

function authArgs() {
  return parseArgs([
    "--stage", "auth",
    "--request", REQUEST_ID,
    "--execute",
    "--prior-stage-satisfied",
    "--proof", "docs/safe-proof-template.md",
    "--latest-dry-run-runnable",
    "--acknowledge-irreversible", "I_UNDERSTAND_ACCOUNT_DELETION_IS_IRREVERSIBLE"
  ]);
}

function requestRow(overrides = {}) {
  return {
    id: REQUEST_ID,
    user_id: null,
    status: "confirmed",
    failure_stage: null,
    failure_reason_code: null,
    auth_cleanup_status: "succeeded",
    auth_sub_finalized_at: AUTH_AT,
    notification_status: "pending",
    completed_at: null,
    expires_at: "2026-09-10T00:00:00.000Z",
    last_attempted_at: AUTH_AT,
    metadata: {},
    ...overrides
  };
}

function makeTerminal(row, completedAt = COMPLETED_AT, expiresAt = EXPIRES_AT) {
  Object.assign(row, {
    status: "completed",
    notification_status: "not_needed",
    completed_at: completedAt,
    expires_at: expiresAt,
    last_attempted_at: completedAt
  });
  return row;
}

function terminalRpc(kind = "completed", completedAt = COMPLETED_AT, expiresAt = EXPIRES_AT) {
  return {
    kind,
    alreadyCompleted: kind === "already_completed",
    completedAt,
    expiresAt,
    completedAtEpochMicros: Date.parse(completedAt) * 1_000,
    expiresAtEpochMicros: Date.parse(expiresAt) * 1_000
  };
}

function rawRpcRow(overrides = {}) {
  return {
    completion_status: "completed",
    safe_reason: "completion_finalized",
    completed_at: COMPLETED_AT,
    expires_at: EXPIRES_AT,
    already_completed: false,
    ...overrides
  };
}

function repositoryFixture({
  row = requestRow(),
  authorityKind = "resolved",
  getRequest,
  finalize = async () => ({ kind: "unknown" }),
  events = []
} = {}) {
  return {
    events,
    resolveAuthority: async () => {
      events.push("repository:resolve-authority");
      return authorityKind === "resolved"
        ? { kind: "resolved", authority: { deletionRequestId: row.id } }
        : { kind: authorityKind };
    },
    getRequestById: async (deletionRequestId) => {
      events.push("repository:get-request");
      return getRequest
        ? getRequest(deletionRequestId, events, row)
        : deletionRequestId === row.id
          ? { kind: "found", request: row }
          : { kind: "missing" };
    },
    finalizeCompletion: async (deletionRequestId) => {
      events.push("repository:completion-rpc");
      return finalize(deletionRequestId, row, events);
    }
  };
}

function bridgeFixture(repository) {
  return createAccountDeletionCompletionOperatorBridge({ env: FAKE_EXECUTE_ENV, repository });
}

async function runWithBridge(bridge, parsed = completionArgs(), extraStages = {}) {
  return runAccountDeletionOperator(parsed, {
    env: FAKE_EXECUTE_ENV,
    requestResolver: bridge.requestResolver,
    stageServices: { ...bridge.stageServices, ...extraStages }
  });
}

function fakeClient({ queryResponses = [], rpcResponse, rpcThrows } = {}) {
  const queryCalls = [];
  const rpcCalls = [];
  return {
    queryCalls,
    rpcCalls,
    from(table) {
      const call = { table, select: null, field: null, value: null, limit: null };
      queryCalls.push(call);
      const query = {
        select(value) { call.select = value; return query; },
        eq(field, value) { call.field = field; call.value = value; return query; },
        async limit(value) {
          call.limit = value;
          return queryResponses.shift() ?? { data: [], error: null };
        }
      };
      return query;
    },
    async rpc(name, args) {
      rpcCalls.push({ name, args });
      if (rpcThrows) throw rpcThrows;
      return rpcResponse ?? { data: null, error: null };
    }
  };
}

console.log("Native Minute G5D Completion canonical operator wiring behavioral fake proof");
console.log("- Completion repository/RPC: injected fake only");
console.log("- real Completion RPC / external calls / Staging / Production mutations: 0");

{
  const invalidClient = fakeClient();
  const invalidRepository = createAccountDeletionCompletionRepository(invalidClient);
  const invalidBridge = bridgeFixture(invalidRepository);
  const invalid = await runWithBridge(invalidBridge, completionArgs({ requestRef: "not-a-request-authority" }));
  assertCheck(
    "A. invalid request UUID/ref stops before Completion RPC",
    invalid.status === "blocked" && invalid.safeReasonCode === "request_ref_invalid" &&
      invalidClient.queryCalls.length === 0 && invalidClient.rpcCalls.length === 0 &&
      invalid.safeCounts.completionRpcCalls === 0,
    "invalid authority is rejected locally"
  );

  const missingClient = fakeClient({ queryResponses: [{ data: [], error: null }] });
  const missing = await runWithBridge(bridgeFixture(createAccountDeletionCompletionRepository(missingClient)),
    completionArgs({ requestRef: ANONYMIZED_REF }));
  assertCheck(
    "B. missing opaque ref stops before Completion RPC",
    missing.status === "blocked" && missing.safeReasonCode === "request_not_found" &&
      missingClient.queryCalls[0].limit === 2 && missingClient.rpcCalls.length === 0 &&
      missing.safeCounts.completionRpcCalls === 0,
    "opaque lookup has a two-row bound"
  );

  const authorityRow = { id: REQUEST_ID, anonymized_user_ref: ANONYMIZED_REF };
  const ambiguousClient = fakeClient({ queryResponses: [{ data: [authorityRow, authorityRow], error: null }] });
  const ambiguous = await runWithBridge(bridgeFixture(createAccountDeletionCompletionRepository(ambiguousClient)),
    completionArgs({ requestRef: ANONYMIZED_REF }));
  assertCheck(
    "C. ambiguous opaque ref stops before Completion RPC",
    ambiguous.status === "blocked" && ambiguous.safeReasonCode === "request_target_ambiguous" &&
      ambiguousClient.queryCalls[0].limit === 2 && ambiguousClient.rpcCalls.length === 0 &&
      ambiguous.safeCounts.completionRpcCalls === 0,
    "only exactly one authority row is accepted"
  );
}

{
  for (const [label, overrides] of [
    ["Auth cleanup nonterminal", { auth_cleanup_status: "pending" }],
    ["Auth timestamp missing", { auth_sub_finalized_at: null }],
    ["owner not scrubbed", { user_id: "11111111-1111-4111-8111-111111111111" }],
    ["failure evidence retained", { failure_stage: "auth" }],
    ["metadata not empty", { metadata: { sentinel: "raw metadata sentinel" } }],
    ["confirmed attempt timestamp mismatch", { last_attempted_at: "2026-09-03T23:49:59.000Z" }]
  ]) {
    const repository = repositoryFixture({ row: requestRow(overrides) });
    const result = await runWithBridge(bridgeFixture(repository));
    assertCheck(
      `D. ${label} fails the persisted minimum precheck with RPC zero`,
      result.status === "blocked" && result.safeReasonCode === "completion_cleanup_not_runnable" &&
        repository.events.filter((event) => event === "repository:completion-rpc").length === 0 &&
        result.safeCounts.completionRpcCalls === 0 && result.safeCounts.completionOutcomeUnknown === 0,
      "caller prior-stage ceremony is not persisted authority"
    );
    assertSafeOutput(`${label} output is redacted`, result);
  }
}

{
  const row = requestRow({
    auth_sub_finalized_at: "2026-09-04T08:50:00+09:00",
    last_attempted_at: AUTH_AT
  });
  const repository = repositoryFixture({
    row,
    finalize: async (_requestId, persisted) => {
      makeTerminal(persisted, "2026-09-04T09:00:00+09:00", "2026-12-03T09:00:00+09:00");
      return terminalRpc("completed");
    }
  });
  const result = await runWithBridge(bridgeFixture(repository));
  assertCheck(
    "E. valid first completion dispatches once, re-fetches, and becomes terminal",
    result.status === "succeeded" && result.progress.terminal === true &&
      result.safeCounts.completionRpcCalls === 1 && result.safeCounts.completionOutcomeUnknown === 0 &&
      result.safeCounts.completionTerminal === 1 && result.safeCounts.completionAlreadyCompleted === 0 &&
      repository.events.filter((event) => event === "repository:get-request").length === 2 &&
      repository.events.filter((event) => event === "repository:completion-rpc").length === 1,
    "timestamp identity is compared as UTC instants, not raw strings"
  );
  assertSafeOutput("first completion output is redacted", result);
}

{
  const row = makeTerminal(requestRow());
  const before = { completedAt: row.completed_at, expiresAt: row.expires_at };
  const repository = repositoryFixture({
    row,
    finalize: async () => terminalRpc("already_completed")
  });
  const result = await runWithBridge(bridgeFixture(repository));
  assertCheck(
    "F. valid completed replay dispatches at most once and preserves timestamps",
    result.status === "already_satisfied" && result.progress.terminal === true &&
      result.safeCounts.completionRpcCalls === 1 && result.safeCounts.completionAlreadyCompleted === 1 &&
      row.completed_at === before.completedAt && row.expires_at === before.expiresAt &&
      repository.events.filter((event) => event === "repository:completion-rpc").length === 1,
    "DB-side replay authority is recovered without rewriting terminal instants"
  );
}

{
  const rejectedRepository = repositoryFixture({ finalize: async () => ({ kind: "rejected" }) });
  const rejected = await runWithBridge(bridgeFixture(rejectedRepository));
  assertCheck(
    "G. safe RPC rejection is fixed, nonterminal, and known",
    rejected.status === "blocked" && rejected.safeReasonCode === "completion_rpc_rejected" &&
      rejected.progress.marker === "completion_rpc_rejected" && rejected.progress.terminal === false &&
      rejected.safeCounts.completionRpcCalls === 1 && rejected.safeCounts.completionOutcomeUnknown === 0 &&
      rejected.safeCounts.completionTerminal === 0,
    "raw DB reason is never repeated"
  );

  const responseLossRepository = repositoryFixture({
    finalize: async () => { throw new Error(`SQLSTATE XX000 private detail stack-private ${REQUEST_ID}`); }
  });
  const responseLoss = await runWithBridge(bridgeFixture(responseLossRepository));
  assertCheck(
    "H. transport/response loss preserves the one observed RPC and never retries",
    responseLoss.status === "manual_required" &&
      responseLoss.safeReasonCode === "completion_stage_result_unknown" &&
      responseLoss.progress.terminal === false && responseLoss.safeCounts.completionRpcCalls === 1 &&
      responseLoss.safeCounts.completionOutcomeUnknown === 1 &&
      responseLoss.safeCounts.completionTerminal === null &&
      responseLossRepository.events.filter((event) => event === "repository:completion-rpc").length === 1,
    "same-invocation retry count is zero"
  );
  assertSafeOutput("response-loss output is redacted", responseLoss);
}

{
  const malformedCases = [
    ["I. zero-row RPC result", []],
    ["J. multiple-row RPC result", [rawRpcRow(), rawRpcRow()]],
    ["K. wrong completion status", [rawRpcRow({ completion_status: "confirmed" })]],
    ["K. wrong reason/boolean polarity", [rawRpcRow({ safe_reason: "already_completed", already_completed: false })]],
    ["L. invalid timestamp", [rawRpcRow({ completed_at: "not-a-timestamp" })]],
    ["L. timestamp without timezone", [rawRpcRow({ completed_at: "2026-09-04T00:00:00" })]],
    ["L. impossible calendar timestamp", [rawRpcRow({ completed_at: "2026-02-30T00:00:00.000Z" })]],
    ["M. RPC expiry delta is not 7,776,000 seconds", [rawRpcRow({ expires_at: "2026-12-03T00:00:01.000Z" })]],
    ["M. RPC expiry delta differs by one microsecond", [rawRpcRow({ expires_at: "2026-12-03T00:00:00.000001Z" })]],
    ["unsafe extra RPC field", [rawRpcRow({ raw_payload: "raw completion row sentinel" })]]
  ];

  for (const [label, data] of malformedCases) {
    const client = fakeClient({ rpcResponse: { data, error: null } });
    const normalized = await createAccountDeletionCompletionRepository(client).finalizeCompletion(REQUEST_ID);
    assertCheck(`${label} normalizes to unknown`, normalized.kind === "unknown" && client.rpcCalls.length === 1,
      "strict five-field single-row contract is required");

    const repository = repositoryFixture({ finalize: async () => normalized });
    const result = await runWithBridge(bridgeFixture(repository));
    assertCheck(
      `${label} stays nonterminal with observed RPC accounting`,
      result.status === "manual_required" && result.safeReasonCode === "completion_stage_result_unknown" &&
        result.safeCounts.completionRpcCalls === 1 && result.safeCounts.completionOutcomeUnknown === 1 &&
        result.safeCounts.completionTerminal === null && result.safeCounts.completionAlreadyCompleted === null,
      "untrusted terminal-looking data cannot authorize Completion"
    );
    assertSafeOutput(`${label} output is redacted`, result);
  }

  const recognized = fakeClient({
    rpcResponse: {
      data: null,
      error: {
        code: "23514",
        message: "completion_prerequisite_authority_invalid",
        details: "SQLSTATE XX000 private detail"
      }
    }
  });
  const rejected = await createAccountDeletionCompletionRepository(recognized).finalizeCompletion(REQUEST_ID);
  assertCheck("recognized transactional rejection normalizes to rejected", rejected.kind === "rejected",
    "only an allowlisted SQLSTATE category is trusted as known rejection");

  const unknownPostgres = fakeClient({
    rpcResponse: { data: null, error: { code: "XX000", message: "SQLSTATE XX000 private detail" } }
  });
  const unknown = await createAccountDeletionCompletionRepository(unknownPostgres).finalizeCompletion(REQUEST_ID);
  assertCheck("unknown PostgreSQL error normalizes to unknown", unknown.kind === "unknown",
    "raw message and unknown SQLSTATE do not cross the repository boundary");

  const unrecognizedSameCode = fakeClient({
    rpcResponse: { data: null, error: { code: "23514", message: "SQLSTATE XX000 private detail" } }
  });
  const sameCodeUnknown = await createAccountDeletionCompletionRepository(unrecognizedSameCode)
    .finalizeCompletion(REQUEST_ID);
  assertCheck("unrecognized message with a known SQLSTATE remains unknown", sameCodeUnknown.kind === "unknown",
    "SQLSTATE alone is not sufficient rejection authority");
}

{
  const timestampMismatch = await runWithBridge(bridgeFixture(repositoryFixture({
    finalize: async (_requestId, row) => {
      makeTerminal(row, "2026-09-04T00:00:01.000Z", "2026-12-03T00:00:01.000Z");
      return terminalRpc("completed");
    }
  })));
  assertCheck(
    "N. terminal-looking RPC plus persisted timestamp mismatch fails closed",
    timestampMismatch.status === "manual_required" &&
      timestampMismatch.safeReasonCode === "completion_terminal_authority_missing" &&
      timestampMismatch.progress.terminal === false && timestampMismatch.safeCounts.completionRpcCalls === 1 &&
      timestampMismatch.safeCounts.completionOutcomeUnknown === 1 &&
      timestampMismatch.safeCounts.completionTerminal === null,
    "RPC timestamps are bound to exact persisted instants"
  );

  const microsecondMismatch = await runWithBridge(bridgeFixture(repositoryFixture({
    finalize: async (_requestId, row) => {
      makeTerminal(row, "2026-09-04T00:00:00.000001Z", "2026-12-03T00:00:00.000001Z");
      return terminalRpc("completed");
    }
  })));
  assertCheck(
    "N. sub-millisecond persisted timestamp mismatch fails closed",
    microsecondMismatch.status === "manual_required" &&
      microsecondMismatch.safeReasonCode === "completion_terminal_authority_missing" &&
      microsecondMismatch.safeCounts.completionTerminal === null,
    "PostgreSQL microsecond precision is not rounded into false instant equality"
  );

  const badPersistedExpiry = await runWithBridge(bridgeFixture(repositoryFixture({
    finalize: async (_requestId, row) => {
      makeTerminal(row, COMPLETED_AT, "2026-12-03T00:00:01.000Z");
      return terminalRpc("completed");
    }
  })));
  assertCheck(
    "O. persisted expiry delta mismatch is nonterminal",
    badPersistedExpiry.status === "manual_required" &&
      badPersistedExpiry.safeReasonCode === "completion_terminal_authority_missing" &&
      badPersistedExpiry.safeCounts.completionTerminal === null,
    "persisted expiry must be exactly 7,776,000,000 milliseconds"
  );

  const replayRow = makeTerminal(requestRow());
  const rewrittenReplay = await runWithBridge(bridgeFixture(repositoryFixture({
    row: replayRow,
    finalize: async (_requestId, row) => {
      makeTerminal(row, REWRITTEN_COMPLETED_AT, REWRITTEN_EXPIRES_AT);
      return terminalRpc("already_completed", REWRITTEN_COMPLETED_AT, REWRITTEN_EXPIRES_AT);
    }
  })));
  assertCheck(
    "P. completed replay pre/post timestamp rewrite fails closed",
    rewrittenReplay.status === "manual_required" &&
      rewrittenReplay.safeReasonCode === "completion_terminal_authority_missing" &&
      rewrittenReplay.safeCounts.completionOutcomeUnknown === 1 &&
      rewrittenReplay.safeCounts.completionAlreadyCompleted === null,
    "replay immutability is independently bound across both reads"
  );
}

{
  const authorityRow = { id: REQUEST_ID, anonymized_user_ref: ANONYMIZED_REF };
  for (const [label, requestRef, field] of [
    ["UUID", REQUEST_ID, "id"],
    ["opaque", ANONYMIZED_REF, "anonymized_user_ref"]
  ]) {
    const client = fakeClient({ queryResponses: [{ data: [authorityRow], error: null }] });
    const repository = createAccountDeletionCompletionRepository(client);
    const result = await resolveAccountDeletionCompletionOperatorRequest(
      { stage: "completion", requestRef },
      { repository }
    );
    assertCheck(
      `Q. exact ${label} authority resolves to the same internal UUID`,
      result.ok === true && result.internal.deletionRequestId === REQUEST_ID &&
        client.queryCalls[0].field === field && client.queryCalls[0].limit === 2,
      "only deletionRequestId crosses the internal resolver boundary"
    );
  }

  let mutationCalls = 0;
  const identityMismatch = await runAccountDeletionCompletionOperatorStage(
    { stage: "completion", mode: "execute", request: { deletionRequestId: REQUEST_ID } },
    {
      env: FAKE_EXECUTE_ENV,
      repository: repositoryFixture({
        getRequest: async () => ({ kind: "found", request: requestRow({ id: OTHER_REQUEST_ID }) }),
        finalize: async () => { mutationCalls += 1; return { kind: "unknown" }; }
      })
    }
  );
  assertCheck(
    "R. cross-request identity mismatch stops before RPC/mutation",
    identityMismatch.status === "blocked" && identityMismatch.safeCounts.completionRpcCalls === 0 &&
      mutationCalls === 0,
    "exact request identity is rechecked without an owner filter"
  );
}

{
  const rawSentinelRepository = repositoryFixture({
    row: requestRow({ metadata: { secret: "raw metadata sentinel" } }),
    finalize: async () => ({ kind: "unknown", raw: "raw completion row sentinel" })
  });
  const rawSentinel = await runWithBridge(bridgeFixture(rawSentinelRepository));
  assertCheck(
    "S. sensitive raw sentinel values have zero safe-output occurrences",
    rawSentinel.status === "blocked" && rawSentinel.safeCounts.completionRpcCalls === 0,
    "precheck blocks before raw result can be reached"
  );
  assertSafeOutput("sensitive Completion output is redacted", rawSentinel);
}

{
  let completionStageCalls = 0;
  const authInvocation = await runAccountDeletionOperator(authArgs(), {
    env: FAKE_EXECUTE_ENV,
    requestResolver: async () => ({ ok: true, internal: { deletionRequestId: REQUEST_ID } }),
    stageServices: {
      auth: async () => ({
        status: "succeeded",
        safeReasonCode: null,
        safeProgress: {
          marker: "terminal",
          terminal: true,
          verifiedAbsent: true,
          authSubFinalized: true
        },
        safeCounts: {
          requestResolverCalls: 1,
          authDurableRunnerCalls: 1,
          authGetCalls: 1,
          authDeleteDispatches: 0,
          authAttempted: 0,
          authOutcomeUnknown: 0,
          authTerminal: 1,
          authNonterminal: 0,
          verificationAttemptCount: 1,
          completionCalls: 0,
          destructiveOperationsAttempted: 0
        }
      }),
      completion: async () => { completionStageCalls += 1; return {}; }
    }
  });
  assertCheck(
    "T. Auth invocation keeps Completion calls at zero",
    authInvocation.status === "succeeded" && authInvocation.safeCounts.completionCalls === 0 &&
      completionStageCalls === 0,
    "one stage per invocation remains exact"
  );

  const laterStageCalls = { provider: 0, storage: 0, database: 0, auth: 0 };
  const row = requestRow();
  const completionInvocation = await runWithBridge(
    bridgeFixture(repositoryFixture({
      row,
      finalize: async (_requestId, persisted) => {
        makeTerminal(persisted);
        return terminalRpc("completed");
      }
    })),
    completionArgs(),
    Object.fromEntries(Object.keys(laterStageCalls).map((stage) => [stage, async () => {
      laterStageCalls[stage] += 1;
      return {};
    }]))
  );
  assertCheck(
    "U. Completion invocation calls no Provider/Storage/Database/Auth/external action",
    completionInvocation.status === "succeeded" &&
      Object.values(laterStageCalls).every((count) => count === 0) &&
      completionInvocation.safeCounts.externalCalls === 0 &&
      completionInvocation.safeCounts.destructiveOperationsAttempted === 0,
    "Completion is one guarded terminal DB mutation, not an external destructive stage"
  );
}

{
  let guardedResolverCalls = 0;
  let guardedServiceCalls = 0;
  const guarded = await runAccountDeletionOperator(completionArgs(), {
    env: {},
    requestResolver: async () => {
      guardedResolverCalls += 1;
      return { ok: true, internal: { deletionRequestId: REQUEST_ID } };
    },
    stageServices: {
      completion: async () => {
        guardedServiceCalls += 1;
        return {};
      }
    }
  });
  assertCheck(
    "Completion remains behind the canonical destructive execution guard",
    guarded.status === "blocked" && guarded.safeReasonCode === "destructive_guard_missing" &&
      guardedResolverCalls === 0 && guardedServiceCalls === 0 && guarded.safeCounts.completionRpcCalls === 0,
    "guard failure precedes resolver, repository, and RPC"
  );

  const missingPrior = await runWithBridge(
    bridgeFixture(repositoryFixture()),
    completionArgs({ priorStageSatisfied: false })
  );
  assertCheck(
    "Completion does not bypass the canonical prior-stage execution ceremony",
    missingPrior.status === "blocked" && missingPrior.safeReasonCode === "prior_stage_not_satisfied" &&
      missingPrior.safeCounts.completionRpcCalls === 0,
    "execution authorization and external-action accounting remain separate"
  );

  const rogue = sanitizeStageServiceResult({
    status: "succeeded",
    safeReasonCode: "raw completion row sentinel",
    safeProgress: { marker: "terminal", terminal: true },
    safeCounts: {
      completionRpcCalls: 1,
      completionOutcomeUnknown: 0,
      completionTerminal: 1,
      completionAlreadyCompleted: 0,
      externalCalls: 1,
      destructiveOperationsAttempted: 1
    }
  }, "completion");
  assertCheck(
    "runner sanitizer fail-closes a rogue Completion service surface",
    rogue.status === "manual_required" && rogue.safeReasonCode === "completion_stage_result_unknown" &&
      rogue.progress.terminal === false && rogue.safeCounts.completionRpcCalls === 1 &&
      rogue.safeCounts.completionOutcomeUnknown === 1 && rogue.safeCounts.completionTerminal === null &&
      rogue.safeCounts.externalCalls === 0 && rogue.safeCounts.destructiveOperationsAttempted === 0,
    "unsafe output cannot claim terminal or external activity"
  );
  assertSafeOutput("rogue Completion sanitizer output is redacted", rogue);

  for (const [label, completionRpcCalls] of [
    ["zero", { completionRpcCalls: 0 }],
    ["missing", {}],
    ["NaN", { completionRpcCalls: Number.NaN }]
  ]) {
    const invalidTerminalAuthority = sanitizeStageServiceResult({
      status: "manual_required",
      safeReasonCode: "completion_terminal_authority_missing",
      safeProgress: { marker: "unknown", terminal: false, manualReviewRequired: true },
      safeCounts: {
        completionOutcomeUnknown: 1,
        completionTerminal: null,
        completionAlreadyCompleted: null,
        externalCalls: 0,
        destructiveOperationsAttempted: 0,
        ...completionRpcCalls
      },
      requestId: REQUEST_ID,
      metadata: "raw metadata sentinel",
      sqlMessage: "SQLSTATE XX000 private detail",
      credentials: "service-role-secret"
    }, "completion");
    assertCheck(
      `terminal-authority-missing with ${label} RPC accounting normalizes to generic unknown`,
      invalidTerminalAuthority.status === "manual_required" &&
        invalidTerminalAuthority.safeReasonCode === "completion_stage_result_unknown" &&
        invalidTerminalAuthority.progress.terminal === false &&
        invalidTerminalAuthority.safeCounts.completionRpcCalls === null &&
        invalidTerminalAuthority.safeCounts.completionOutcomeUnknown === 1 &&
        invalidTerminalAuthority.safeCounts.completionTerminal === null &&
        invalidTerminalAuthority.safeCounts.completionAlreadyCompleted === null,
      "the runner neither creates false-zero evidence nor infers a dispatched RPC"
    );
    assertSafeOutput(`${label} invalid terminal-authority surface is redacted`, invalidTerminalAuthority);
  }

  const validTerminalAuthority = sanitizeStageServiceResult({
    status: "manual_required",
    safeReasonCode: "completion_terminal_authority_missing",
    safeProgress: { marker: "unknown", terminal: false, manualReviewRequired: true },
    safeCounts: {
      completionRpcCalls: 1,
      completionOutcomeUnknown: 1,
      completionTerminal: null,
      completionAlreadyCompleted: null,
      externalCalls: 0,
      destructiveOperationsAttempted: 0
    }
  }, "completion");
  assertCheck(
    "terminal-authority-missing with trusted RPC accounting remains valid",
    validTerminalAuthority.status === "manual_required" &&
      validTerminalAuthority.safeReasonCode === "completion_terminal_authority_missing" &&
      validTerminalAuthority.progress.terminal === false &&
      validTerminalAuthority.safeCounts.completionRpcCalls === 1 &&
      validTerminalAuthority.safeCounts.completionOutcomeUnknown === 1 &&
      validTerminalAuthority.safeCounts.completionTerminal === null &&
      validTerminalAuthority.safeCounts.completionAlreadyCompleted === null,
    "the established post-RPC mismatch surface is preserved"
  );
}

{
  const client = fakeClient({ rpcResponse: { data: [rawRpcRow()], error: null } });
  const repository = createAccountDeletionCompletionRepository(client);
  const result = await repository.finalizeCompletion(REQUEST_ID);
  assertCheck(
    "repository calls only the exact Completion RPC once with the generated contract",
    result.kind === "completed" && result.alreadyCompleted === false &&
      result.expiresAtEpochMicros - result.completedAtEpochMicros === ACCOUNT_DELETION_COMPLETION_EXPIRY_MS * 1_000 &&
      client.rpcCalls.length === 1 &&
      client.rpcCalls[0].name === "finalize_account_deletion_completion" &&
      client.rpcCalls[0].args.p_deletion_request_id === REQUEST_ID,
    "automatic repository retry and direct UPDATE are both zero"
  );

  const repositorySource = readFileSync(
    "services/account-deletion/account-deletion-completion.repository.ts",
    "utf8"
  );
  const operatorSource = readFileSync(
    "services/account-deletion/account-deletion-completion-operator.service.ts",
    "utf8"
  );
  const entrySource = readFileSync("scripts/account-deletion-operator-entry.mjs", "utf8");
  assertCheck(
    "Completion repository has one focused RPC and no direct update/legacy executor",
    (repositorySource.match(/client\.rpc\(/g) ?? []).length === 1 &&
      repositorySource.includes("finalize_account_deletion_completion") &&
      !repositorySource.includes(".update(") &&
      !repositorySource.includes("runAccountDeletionAuthDurableStep"),
    "0027 remains the deep prerequisite and mutation authority"
  );
  assertCheck(
    "Completion service does not import or call earlier stages or notifications",
    !operatorSource.includes("ProviderOperator") && !operatorSource.includes("StorageOperator") &&
      !operatorSource.includes("DatabaseOperator") && !operatorSource.includes("AuthOperator") &&
      !operatorSource.includes("notification sender"),
    "same-invocation stage chaining is absent"
  );
  assertCheck(
    "canonical entry routes Completion explicitly",
    entrySource.includes("createAccountDeletionCompletionOperatorBridge") &&
      entrySource.includes("input.stage === \"completion\"") &&
      entrySource.includes("completionBridge.requestResolver(input)"),
    "future and unknown stages still fail closed"
  );
}

assertCheck(
  "real Completion/external/Staging/Production calls remain zero",
  process.env.NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE !== "1",
  "fake execute authority exists only in injected objects"
);

console.log("\nResult: G5D Completion canonical operator wiring behavioral fake proof passed.");
