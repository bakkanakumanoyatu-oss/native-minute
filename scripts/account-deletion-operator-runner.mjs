#!/usr/bin/env node

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local", quiet: true });

const DESTRUCTIVE_GUARD_ENV = "NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE";
const VALID_STAGES = new Set(["provider", "storage", "database", "auth", "status", "summary"]);
const DESTRUCTIVE_STAGES = new Set(["provider", "storage", "database", "auth"]);
const READ_ONLY_RESOLVER_STAGES = new Set(["status", "summary"]);
const REQUEST_STATUSES = new Set([
  "requested",
  "confirmed",
  "processing",
  "provider_cleanup_failed",
  "storage_cleanup_failed",
  "db_cleanup_failed",
  "auth_cleanup_failed",
  "completed",
  "cancelled",
  "expired"
]);
const CLEANUP_STATUSES = new Set(["pending", "not_needed", "succeeded", "failed", "manual_required"]);
const IRREVERSIBLE_ACKNOWLEDGEMENTS = new Set([
  "I_UNDERSTAND_ACCOUNT_DELETION_IS_IRREVERSIBLE",
  "DELETE_DISPOSABLE_ACCOUNT"
]);

function parseArgs(argv) {
  const parsed = {
    stages: [],
    requestRef: "",
    execute: false,
    dryRun: false,
    acknowledge: "",
    proofPath: "",
    envLabel: "",
    latestDryRunRunnable: false,
    priorStageSatisfied: false,
    proofCandidate: {
      disposableAccount: false,
      ownerConfirmed: false,
      reviewerConfirmed: false,
      approverConfirmed: false,
      dryRunsRunnable: false,
      humanChecksAligned: false
    },
    help: false,
    unknown: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--stage":
        parsed.stages.push(argv[index + 1] ?? "");
        index += 1;
        break;
      case "--request":
        parsed.requestRef = argv[index + 1] ?? "";
        index += 1;
        break;
      case "--execute":
        parsed.execute = true;
        break;
      case "--dry-run":
        parsed.dryRun = true;
        break;
      case "--acknowledge-irreversible":
        if (argv[index + 1] && !argv[index + 1].startsWith("--")) {
          parsed.acknowledge = argv[index + 1];
          index += 1;
        }
        break;
      case "--proof":
        parsed.proofPath = argv[index + 1] ?? "";
        index += 1;
        break;
      case "--env-label":
        parsed.envLabel = argv[index + 1] ?? "";
        index += 1;
        break;
      case "--latest-dry-run-runnable":
        parsed.latestDryRunRunnable = true;
        break;
      case "--prior-stage-satisfied":
        parsed.priorStageSatisfied = true;
        break;
      case "--proof-candidate-disposable":
        parsed.proofCandidate.disposableAccount = true;
        break;
      case "--proof-candidate-owner-confirmed":
        parsed.proofCandidate.ownerConfirmed = true;
        break;
      case "--proof-candidate-reviewer-confirmed":
        parsed.proofCandidate.reviewerConfirmed = true;
        break;
      case "--proof-candidate-approver-confirmed":
        parsed.proofCandidate.approverConfirmed = true;
        break;
      case "--proof-candidate-dry-runs-runnable":
        parsed.proofCandidate.dryRunsRunnable = true;
        break;
      case "--proof-candidate-human-checks-aligned":
        parsed.proofCandidate.humanChecksAligned = true;
        break;
      case "--help":
      case "-h":
        parsed.help = true;
        break;
      default:
        parsed.unknown.push(arg);
        break;
    }
  }

  return parsed;
}

function hasMultipleStages(stages) {
  if (stages.length !== 1) {
    return stages.length > 1;
  }

  return stages[0].includes(",");
}

function normalizeStage(stages) {
  if (stages.length !== 1) {
    return "";
  }

  return stages[0].trim().toLowerCase();
}

function getNextAction(input) {
  if (input.status === "ready_for_dry_run") {
    return "Use this safe summary in the proof template, then run the matching dry-run API/checklist before any execute attempt.";
  }

  if (input.status === "ready_for_execution") {
    return "Stage service guard passed. Execute exactly this stage, record the safe result, then stop for proof review.";
  }

  if (input.status === "blocked") {
    return "Resolve the blocked guard and rerun in dry-run mode; do not enable destructive execution yet.";
  }

  return "No destructive action was taken.";
}

function buildSafeSummary(parsed, env = process.env, options = {}) {
  const stage = normalizeStage(parsed.stages);
  const mode = parsed.execute ? "execute" : "dry_run";
  const destructiveGuard = env[DESTRUCTIVE_GUARD_ENV] === "1";
  const hasRequestRef = parsed.requestRef.trim().length > 0;
  const proofPathProvided = parsed.proofPath.trim().length > 0;
  const acknowledgementAccepted = IRREVERSIBLE_ACKNOWLEDGEMENTS.has(parsed.acknowledge);
  const destructiveStage = DESTRUCTIVE_STAGES.has(stage);
  const validStage = VALID_STAGES.has(stage);
  const multipleStages = hasMultipleStages(parsed.stages);
  const priorStageSatisfied = stage === "provider" ? true : parsed.priorStageSatisfied;
  const actualServiceConnected = options.actualServiceConnected === true && destructiveStage;
  const requestResolverConnected = options.requestResolverConnected === true && actualServiceConnected;
  const blockedReasons = [];

  if (parsed.help) {
    return {
      stage: "help",
      mode: "dry_run",
      status: "ready_for_dry_run",
      safeCounts: {
        stagesRequested: parsed.stages.length,
        destructiveOperationsAttempted: 0
      },
      safeReasonCode: null,
      nextAction: "Run with --stage provider|storage|database|auth|status|summary. Dry-run is the default.",
      proof: {
        envLabel: parsed.envLabel ? "provided" : "not_provided",
        proofPath: parsed.proofPath ? "provided" : "not_provided",
        requestRef: "not_echoed"
      },
      guard: {
        destructiveGuard,
        executeRequested: false,
        requestRefProvided: false,
        irreversibleAcknowledgementAccepted: false,
        oneStagePerInvocation: true,
        requestResolverConnected: false,
        actualServiceConnected: false
      },
      notes: [
        "This operator runner is an internal skeleton.",
        "It does not call provider, Storage, DB, or Auth destructive services."
      ]
    };
  }

  if (parsed.unknown.length > 0) {
    blockedReasons.push("unknown_arguments");
  }

  if (parsed.stages.length === 0) {
    blockedReasons.push("stage_missing");
  }

  if (multipleStages) {
    blockedReasons.push("multiple_stages_not_allowed");
  }

  if (stage && !validStage) {
    blockedReasons.push("stage_invalid");
  }

  if (parsed.execute && !destructiveStage) {
    blockedReasons.push("execute_requires_destructive_stage");
  }

  if (parsed.execute && !hasRequestRef) {
    blockedReasons.push("request_ref_required_for_execute");
  }

  if (parsed.execute && !destructiveGuard) {
    blockedReasons.push("destructive_guard_missing");
  }

  if (parsed.execute && !acknowledgementAccepted) {
    blockedReasons.push("irreversible_acknowledgement_missing");
  }

  if (parsed.execute && !proofPathProvided) {
    blockedReasons.push("proof_path_required_for_execute");
  }

  if (parsed.execute && !parsed.latestDryRunRunnable) {
    blockedReasons.push("latest_dry_run_runnable_required");
  }

  if (parsed.execute && !priorStageSatisfied) {
    blockedReasons.push("prior_stage_not_satisfied");
  }

  if (parsed.execute && !actualServiceConnected) {
    blockedReasons.push("actual_service_not_connected_in_skeleton");
  }

  if (parsed.execute && actualServiceConnected && !requestResolverConnected) {
    blockedReasons.push("request_resolver_not_connected_in_skeleton");
  }

  const status =
    blockedReasons.length > 0 ? "blocked" : parsed.execute ? "ready_for_execution" : "ready_for_dry_run";
  const safeReasonCode = blockedReasons[0] ?? null;

  return {
    stage: stage || "not_provided",
    mode,
    status,
    safeCounts: {
      stagesRequested: parsed.stages.length,
      destructiveOperationsAttempted: 0
    },
    safeReasonCode,
    nextAction: getNextAction({ status }),
    proof: {
      envLabel: parsed.envLabel ? "provided" : "not_provided",
      proofPath: proofPathProvided ? "provided" : "not_provided",
      requestRef: hasRequestRef ? "provided_not_echoed" : "not_provided"
    },
    guard: {
      destructiveGuard,
      executeRequested: parsed.execute,
      requestRefProvided: hasRequestRef,
      irreversibleAcknowledgementAccepted: acknowledgementAccepted,
      latestDryRunRunnable: parsed.latestDryRunRunnable,
      priorStageSatisfied: stage === "provider" ? "not_applicable" : parsed.priorStageSatisfied,
      oneStagePerInvocation: parsed.stages.length === 1 && !multipleStages,
      requestResolverConnected,
      actualServiceConnected
    },
    notes: [
      "Dry-run is the default and this skeleton does not perform destructive cleanup.",
      "No provider identifier, storage locator, DB identifier, auth credential, email, or provider response payload is printed.",
      actualServiceConnected
        ? "An injected internal stage service seam is available for this invocation."
        : "Actual stage services remain disconnected until a future approved runner implementation."
    ]
  };
}

function sanitizeRequestResolverResult(result = {}) {
  const ok = result.ok === true || result.status === "resolved";
  const internal = result.internal && typeof result.internal === "object" ? result.internal : {};
  const hasInternalTarget =
    typeof internal.userId === "string" &&
    internal.userId.trim().length > 0 &&
    typeof internal.deletionRequestId === "string" &&
    internal.deletionRequestId.trim().length > 0;
  const resolved = ok && hasInternalTarget;

  return {
    ok: resolved,
    safeReasonCode: resolved
      ? null
      : toSafeReasonCode(result.safeReasonCode ?? (ok ? "request_resolver_missing_internal_target" : "request_resolver_blocked")),
    safeRequest: {
      requestRef: "provided_not_echoed",
      userRef: resolved ? "resolved_not_echoed" : "not_resolved",
      deletionRequestRef: resolved ? "resolved_not_echoed" : "not_resolved"
    },
    internal: resolved
      ? {
          userId: internal.userId,
          deletionRequestId: internal.deletionRequestId
        }
      : null
  };
}

function toSafeReasonCode(value) {
  if (typeof value !== "string") {
    return "stage_service_result";
  }

  const normalized = value.toLowerCase().replace(/[^a-z0-9_:-]/g, "_").slice(0, 80);
  const forbiddenFragments = [
    "user_",
    "voice_",
    "provider_voice",
    "storage_path",
    "object_key",
    "signed",
    "request_id",
    "deletion_request",
    "req_",
    "row_id",
    "transcript",
    "script_body",
    "service_role",
    "token",
    "raw_provider"
  ];

  if (forbiddenFragments.some((fragment) => normalized.includes(fragment))) {
    return "stage_service_result";
  }

  return normalized || "stage_service_result";
}

function toSafeNonNegativeNumber(value) {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Math.floor(value);
}

function normalizeCleanupStatus(value) {
  return CLEANUP_STATUSES.has(value) ? value : "pending";
}

function normalizeRequestStatus(value) {
  return REQUEST_STATUSES.has(value) ? value : "expired";
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isAnonymizedRequestRefLike(value) {
  return /^adr_[0-9a-f]{32}$/i.test(value);
}

function createSafeRequestStatus(row) {
  const userResolved = typeof row?.user_id === "string" && row.user_id.trim().length > 0;
  const requestResolved = typeof row?.id === "string" && row.id.trim().length > 0;

  return {
    ok: requestResolved,
    safeRequest: {
      requestRef: "provided_not_echoed",
      userRef: userResolved ? "resolved_not_echoed" : "not_available_after_auth_cleanup",
      deletionRequestRef: requestResolved ? "resolved_not_echoed" : "not_resolved"
    },
    requestStatus: normalizeRequestStatus(row?.status),
    stageStatuses: {
      provider: normalizeCleanupStatus(row?.provider_cleanup_status),
      storage: normalizeCleanupStatus(row?.storage_cleanup_status),
      database: normalizeCleanupStatus(row?.db_cleanup_status),
      auth: normalizeCleanupStatus(row?.auth_cleanup_status),
      notification: normalizeCleanupStatus(row?.notification_status)
    },
    safeCounts: {
      requestResolverCalls: 1,
      retryCount: toSafeNonNegativeNumber(row?.retry_count)
    },
    safeReasonCode: null,
    internal:
      userResolved && requestResolved
        ? {
            userId: row.user_id,
            deletionRequestId: row.id
          }
        : null
  };
}

function assessDisposableProofCandidate(input = {}) {
  const stageStatuses = input.stageStatuses ?? {};
  const confirmations = input.confirmations ?? {};
  const cleanupStatuses = [
    normalizeCleanupStatus(stageStatuses.provider),
    normalizeCleanupStatus(stageStatuses.storage),
    normalizeCleanupStatus(stageStatuses.database),
    normalizeCleanupStatus(stageStatuses.auth)
  ];
  const unsafeStartedOrFailed = cleanupStatuses.some((status) =>
    ["succeeded", "failed", "manual_required"].includes(status)
  );
  const checks = {
    disposableAccount: confirmations.disposableAccount === true,
    ownerConfirmed: confirmations.ownerConfirmed === true,
    reviewerConfirmed: confirmations.reviewerConfirmed === true,
    approverConfirmed: confirmations.approverConfirmed === true,
    dryRunsRunnable: confirmations.dryRunsRunnable === true,
    humanChecksAligned: confirmations.humanChecksAligned === true,
    requestConfirmed: input.requestStatus === "confirmed",
    stageStatusesFresh: !unsafeStartedOrFailed
  };
  const blockedReason =
    (!checks.requestConfirmed && "request_not_confirmed") ||
    (!checks.stageStatusesFresh && "stage_status_not_fresh") ||
    (!checks.disposableAccount && "disposable_account_confirmation_missing") ||
    (!checks.ownerConfirmed && "owner_confirmation_missing") ||
    (!checks.reviewerConfirmed && "reviewer_confirmation_missing") ||
    (!checks.approverConfirmed && "approver_confirmation_missing") ||
    (!checks.dryRunsRunnable && "dry_run_readiness_missing") ||
    (!checks.humanChecksAligned && "human_check_alignment_missing") ||
    null;

  return {
    status: blockedReason ? "blocked" : "pass",
    safeReasonCode: blockedReason,
    checks,
    nextAction: blockedReason
      ? "Do not run destructive proof. Resolve the blocked candidate condition and rerun status/summary."
      : "Candidate can be copied to the disposable proof template for release-owner review. Do not enable destructive cleanup yet."
  };
}

function sanitizeReadOnlyRequestResolverResult(result = {}) {
  if (result.ok !== true) {
    return {
      ok: false,
      safeRequest: {
        requestRef: "provided_not_echoed",
        userRef: "not_resolved",
        deletionRequestRef: "not_resolved"
      },
      requestStatus: "unknown",
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
      safeReasonCode: toSafeReasonCode(result.safeReasonCode ?? "request_resolver_blocked")
    };
  }

  return {
    ok: true,
    safeRequest: {
      requestRef: "provided_not_echoed",
      userRef:
        result.safeRequest?.userRef === "not_available_after_auth_cleanup"
          ? "not_available_after_auth_cleanup"
          : "resolved_not_echoed",
      deletionRequestRef: "resolved_not_echoed"
    },
    requestStatus: normalizeRequestStatus(result.requestStatus),
    stageStatuses: {
      provider: normalizeCleanupStatus(result.stageStatuses?.provider),
      storage: normalizeCleanupStatus(result.stageStatuses?.storage),
      database: normalizeCleanupStatus(result.stageStatuses?.database),
      auth: normalizeCleanupStatus(result.stageStatuses?.auth),
      notification: normalizeCleanupStatus(result.stageStatuses?.notification)
    },
    safeCounts: {
      requestResolverCalls: toSafeNonNegativeNumber(result.safeCounts?.requestResolverCalls) || 1,
      retryCount: toSafeNonNegativeNumber(result.safeCounts?.retryCount)
    },
    safeReasonCode: null
  };
}

async function resolveAccountDeletionRequestReadOnly(input = {}, env = process.env) {
  const stage = (input.stage ?? "").trim().toLowerCase();
  const requestRef = (input.requestRef ?? "").trim();

  if (!READ_ONLY_RESOLVER_STAGES.has(stage)) {
    return {
      ok: false,
      safeReasonCode: "read_only_resolver_stage_not_allowed"
    };
  }

  if (!requestRef) {
    return {
      ok: false,
      safeReasonCode: "request_ref_required"
    };
  }

  const lookupById = isUuidLike(requestRef);
  const lookupByAnonymizedRef = isAnonymizedRequestRefLike(requestRef);

  if (!lookupById && !lookupByAnonymizedRef) {
    return {
      ok: false,
      safeReasonCode: "request_ref_invalid"
    };
  }

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      ok: false,
      safeReasonCode: "read_only_resolver_env_missing"
    };
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
  const query = admin
    .from("account_deletion_requests")
    .select(
      "id,user_id,status,provider_cleanup_status,storage_cleanup_status,db_cleanup_status,auth_cleanup_status,notification_status,retry_count"
    )
    .limit(1);
  const { data, error } = await (lookupById
    ? query.eq("id", requestRef).maybeSingle()
    : query.eq("anonymized_user_ref", requestRef).maybeSingle());

  if (error) {
    return {
      ok: false,
      safeReasonCode: "read_only_resolver_lookup_failed"
    };
  }

  if (!data) {
    return {
      ok: false,
      safeReasonCode: "request_not_found"
    };
  }

  return createSafeRequestStatus(data);
}

function sanitizeStageServiceResult(result = {}) {
  const allowedStatuses = new Set(["succeeded", "not_needed", "failed", "manual_required", "blocked"]);
  const status = allowedStatuses.has(result.status) ? result.status : "blocked";
  const safeCounts = result.safeCounts && typeof result.safeCounts === "object" ? result.safeCounts : {};

  return {
    status,
    safeReasonCode: toSafeReasonCode(result.safeReasonCode),
    safeCounts: {
      stagesRequested: 1,
      requestResolverCalls: toSafeNonNegativeNumber(safeCounts.requestResolverCalls),
      stageServiceCalls: 1,
      destructiveOperationsAttempted: toSafeNonNegativeNumber(safeCounts.destructiveOperationsAttempted),
      providerCandidates: toSafeNonNegativeNumber(safeCounts.providerCandidates),
      storageObjects: toSafeNonNegativeNumber(safeCounts.storageObjects),
      databaseTables: toSafeNonNegativeNumber(safeCounts.databaseTables),
      authUsers: toSafeNonNegativeNumber(safeCounts.authUsers)
    },
    nextAction:
      status === "succeeded" || status === "not_needed"
        ? "Record this safe stage result in the proof template, then stop before the next stage."
        : "Stop at this stage, record the safe reason code, and follow the manual review path."
  };
}

async function runAccountDeletionOperator(argv = process.argv.slice(2), options = {}) {
  const parsed = Array.isArray(argv) ? parseArgs(argv) : argv;
  const stage = normalizeStage(parsed.stages);
  const stageServices = options.stageServices ?? {};
  const stageService = stageServices[stage];
  const requestResolver = options.requestResolver;
  const summary = buildSafeSummary(parsed, options.env ?? process.env, {
    actualServiceConnected: typeof stageService === "function",
    requestResolverConnected: typeof requestResolver === "function"
  });

  if (
    !parsed.execute &&
    READ_ONLY_RESOLVER_STAGES.has(stage) &&
    parsed.requestRef.trim().length > 0 &&
    typeof requestResolver === "function"
  ) {
    const resolvedStatus = sanitizeReadOnlyRequestResolverResult(
      await requestResolver({
        stage,
        requestRef: parsed.requestRef,
        mode: "read_only_status",
        proofPath: summary.proof.proofPath,
        envLabel: summary.proof.envLabel
      })
    );

    return {
      ...summary,
      status: resolvedStatus.ok ? summary.status : "blocked",
      safeReasonCode: resolvedStatus.ok ? summary.safeReasonCode : resolvedStatus.safeReasonCode,
      safeCounts: {
        ...summary.safeCounts,
        ...resolvedStatus.safeCounts,
        destructiveOperationsAttempted: 0
      },
      request: resolvedStatus.safeRequest,
      deletionRequest: {
        status: resolvedStatus.requestStatus,
        stageStatuses: resolvedStatus.stageStatuses
      },
      proofCandidate: assessDisposableProofCandidate({
        requestStatus: resolvedStatus.requestStatus,
        stageStatuses: resolvedStatus.stageStatuses,
        confirmations: parsed.proofCandidate
      }),
      nextAction: resolvedStatus.ok
        ? "Record this read-only request status in the proof template. Do not run destructive cleanup from this status check."
        : "Resolve the request reference or resolver configuration, then rerun status/summary. Do not proceed to destructive stages.",
      guard: {
        ...summary.guard,
        requestResolved: resolvedStatus.ok,
        stageServiceCalled: false,
        readOnlyResolver: true
      },
      notes: [
        resolvedStatus.ok
          ? "Read-only request resolver returned safe request status and stage statuses."
          : "Read-only request resolver could not resolve the request reference.",
        "No provider, Storage, DB, or Auth cleanup service was called.",
        "No raw user id, deletion request id, email, request reference, auth credential, or admin key is printed."
      ]
    };
  }

  if (summary.status !== "ready_for_execution") {
    return summary;
  }

  const resolvedRequest = sanitizeRequestResolverResult(await requestResolver({
    stage,
    requestRef: parsed.requestRef,
    proofPath: summary.proof.proofPath,
    envLabel: summary.proof.envLabel
  }));

  if (!resolvedRequest.ok) {
    return {
      ...summary,
      status: "blocked",
      safeReasonCode: resolvedRequest.safeReasonCode,
      safeCounts: {
        ...summary.safeCounts,
        requestResolverCalls: 1,
        stageServiceCalls: 0,
        destructiveOperationsAttempted: 0
      },
      nextAction: "Stop before any stage service call; resolve the request reference using server-side account deletion state.",
      guard: {
        ...summary.guard,
        requestResolved: false,
        stageServiceCalled: false
      },
      request: resolvedRequest.safeRequest,
      notes: [
        "Request resolver did not return a safe internal target.",
        "No provider, Storage, DB, or Auth stage service was called.",
        "No raw user id, deletion request id, email, or request reference is printed."
      ]
    };
  }

  const serviceResult = await stageService({
    stage,
    mode: summary.mode,
    request: resolvedRequest.internal,
    safeRequest: resolvedRequest.safeRequest,
    proofPath: summary.proof.proofPath,
    envLabel: summary.proof.envLabel
  });
  const safeServiceResult = sanitizeStageServiceResult(serviceResult);

  return {
    ...summary,
    status: safeServiceResult.status,
    safeReasonCode: safeServiceResult.safeReasonCode,
    safeCounts: safeServiceResult.safeCounts,
    nextAction: safeServiceResult.nextAction,
    guard: {
      ...summary.guard,
      requestResolved: true,
      stageServiceCalled: true
    },
    request: resolvedRequest.safeRequest,
    notes: [
      "Safe request resolver and internal stage service seam returned safe summaries.",
      "No raw user, provider, storage, DB, Auth, or provider response data is printed.",
      "RR-3k self-tests use fake resolver and fake stage services only; the default CLI remains disconnected from real destructive services."
    ]
  };
}

function printHelp() {
  console.log(`Native Minute account deletion operator runner

Usage:
  npm run account-deletion:operator -- --stage provider --request <request-ref> --dry-run
  npm run account-deletion:operator -- --stage provider --request <request-ref> --execute --proof <proof-doc> --latest-dry-run-runnable --acknowledge-irreversible I_UNDERSTAND_ACCOUNT_DELETION_IS_IRREVERSIBLE

Stages:
  provider | storage | database | auth | status | summary

Safety:
  - dry-run is the default
  - one stage per invocation
  - execute mode is blocked unless ${DESTRUCTIVE_GUARD_ENV}=1 and acknowledgement are present
  - execute mode also requires a prepared proof path and latest dry-run runnable confirmation
  - storage/database/auth execute mode requires --prior-stage-satisfied
  - status/summary can model disposable proof candidacy with --proof-candidate-* flags
  - this skeleton does not call actual provider, Storage, DB, or Auth deletion services
  - raw request refs are accepted for targeting but never echoed
`);
}

export {
  DESTRUCTIVE_GUARD_ENV,
  IRREVERSIBLE_ACKNOWLEDGEMENTS,
  assessDisposableProofCandidate,
  buildSafeSummary,
  parseArgs,
  resolveAccountDeletionRequestReadOnly,
  runAccountDeletionOperator,
  sanitizeReadOnlyRequestResolverResult,
  sanitizeRequestResolverResult,
  sanitizeStageServiceResult
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const parsed = parseArgs(process.argv.slice(2));

  if (parsed.help) {
    printHelp();
  }

  const summary = await runAccountDeletionOperator(parsed, {
    env: process.env,
    requestResolver: (input) => resolveAccountDeletionRequestReadOnly(input, process.env),
    stageServices: {}
  });
  console.log(JSON.stringify(summary, null, 2));

  if (summary.status === "blocked") {
    process.exitCode = 2;
  }
}
