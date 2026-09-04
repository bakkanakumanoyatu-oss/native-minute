#!/usr/bin/env node

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local", quiet: true });

const DESTRUCTIVE_GUARD_ENV = "NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE";
const VALID_STAGES = new Set(["provider", "storage", "database", "auth", "completion", "status", "summary"]);
const DESTRUCTIVE_STAGES = new Set(["provider", "storage", "database", "auth"]);
const EXECUTABLE_STAGES = new Set([...DESTRUCTIVE_STAGES, "completion"]);
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
const AUTH_OPERATOR_SAFE_REASON_CODES = new Set([
  "auth_stage_reason_unknown",
  "auth_request_not_found",
  "auth_intent_owner_unavailable",
  "auth_intent_owner_mismatch",
  "auth_prior_stages_not_terminal",
  "auth_intent_seal_stale",
  "auth_durable_state_invalid",
  "auth_owner_not_null_after_verified_absence",
  "auth_sub_finalizer_rejected",
  "auth_verification_result_stale",
  "auth_user_present_after_dispatch_manual_required",
  "auth_get_permission_denied",
  "auth_get_user_mismatch",
  "auth_get_protocol_error",
  "auth_get_rate_limited",
  "auth_get_timeout",
  "auth_get_network_error",
  "auth_get_unavailable",
  "auth_delete_dispatch_cas_lost",
  "auth_delete_permission_denied",
  "auth_delete_rate_limited_outcome_unknown",
  "auth_delete_timeout_outcome_unknown",
  "auth_delete_network_error_outcome_unknown",
  "auth_delete_malformed_outcome_unknown",
  "auth_delete_unavailable_outcome_unknown",
  "auth_delete_outcome_unknown",
  "auth_post_delete_verification_stale",
  "auth_terminal_authority_missing",
  "auth_durable_stage_result_unknown",
  "auth_stage_not_allowed",
  "auth_cleanup_not_runnable",
  "auth_request_authority_mismatch",
  "destructive_guard_missing",
  "request_target_invalid"
]);
const COMPLETION_OPERATOR_SAFE_REASON_CODES = new Set([
  "completion_cleanup_not_runnable",
  "completion_rpc_rejected",
  "completion_stage_result_unknown",
  "completion_terminal_authority_missing"
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
  const executableStage = EXECUTABLE_STAGES.has(stage);
  const validStage = VALID_STAGES.has(stage);
  const multipleStages = hasMultipleStages(parsed.stages);
  const priorStageSatisfied = stage === "provider" ? true : parsed.priorStageSatisfied;
  const actualServiceConnected = options.actualServiceConnected === true && executableStage;
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
      nextAction: "Run with --stage provider|storage|database|auth|completion|status|summary. Dry-run is the default.",
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
        "This operator runner is an internal one-stage account-deletion execution surface.",
        "It does not call Provider, Storage, Database, Auth, or Completion services from help mode."
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

  if (parsed.execute && !executableStage) {
    blockedReasons.push("execute_requires_executable_stage");
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
      destructiveOperationsAttempted: 0,
      ...databaseSafeZeroCounts(stage),
      ...authSafeZeroCounts(stage),
      ...completionSafeZeroCounts(stage)
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
      "Dry-run is the default and does not perform destructive cleanup.",
      "No provider identifier, storage locator, DB identifier, auth credential, email, or provider response payload is printed.",
      actualServiceConnected
        ? "An injected internal stage service seam is available for this invocation."
        : "Actual stage services remain disconnected until a future approved runner implementation."
    ]
  };
}

function sanitizeRequestResolverResult(result = {}, stage = "") {
  const ok = result.ok === true || result.status === "resolved";
  const internal = result.internal && typeof result.internal === "object" ? result.internal : {};
  const hasOwnedInternalTarget =
    typeof internal.userId === "string" &&
    internal.userId.trim().length > 0 &&
    typeof internal.deletionRequestId === "string" &&
    internal.deletionRequestId.trim().length > 0;
  const hasAuthInternalTarget =
    typeof internal.deletionRequestId === "string" &&
    internal.deletionRequestId.trim().length > 0 &&
    (internal.expectedUserId === undefined ||
      (typeof internal.expectedUserId === "string" && internal.expectedUserId.trim().length > 0));
  const authStage = stage === "auth";
  const completionStage = stage === "completion";
  const hasCompletionInternalTarget =
    typeof internal.deletionRequestId === "string" && internal.deletionRequestId.trim().length > 0;
  const hasInternalTarget = completionStage
    ? hasCompletionInternalTarget
    : authStage
      ? hasAuthInternalTarget
      : hasOwnedInternalTarget;
  const resolved = ok && hasInternalTarget;

  return {
    ok: resolved,
    safeReasonCode: resolved
      ? null
      : toSafeReasonCode(result.safeReasonCode ?? (ok ? "request_resolver_missing_internal_target" : "request_resolver_blocked")),
    safeRequest: {
      requestRef: "provided_not_echoed",
      userRef: resolved
        ? completionStage || (authStage && internal.expectedUserId === undefined)
          ? "not_available_after_auth_cleanup"
          : "resolved_not_echoed"
        : "not_resolved",
      deletionRequestRef: resolved ? "resolved_not_echoed" : "not_resolved"
    },
    internal: resolved
      ? {
          ...(completionStage
            ? { deletionRequestId: internal.deletionRequestId }
            : authStage
            ? {
                deletionRequestId: internal.deletionRequestId,
                ...(internal.expectedUserId === undefined ? {} : { expectedUserId: internal.expectedUserId })
              }
            : { userId: internal.userId, deletionRequestId: internal.deletionRequestId })
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

function toSafeAuthReasonCode(value, status) {
  if (value === null && (status === "succeeded" || status === "not_needed")) return null;
  return typeof value === "string" && AUTH_OPERATOR_SAFE_REASON_CODES.has(value)
    ? value
    : "auth_durable_stage_result_unknown";
}

function toSafeCompletionReasonCode(value, status) {
  if (value === null && (status === "succeeded" || status === "already_satisfied")) return null;
  return typeof value === "string" && COMPLETION_OPERATOR_SAFE_REASON_CODES.has(value)
    ? value
    : "completion_stage_result_unknown";
}

function toSafeNonNegativeNumber(value) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    return 0;
  }

  return value;
}

function toSafeNullableNonNegativeNumber(value) {
  return value === null ? null : toSafeNonNegativeNumber(value);
}

function toSafeNullableEvidenceNumber(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function databaseSafeZeroCounts(stage) {
  return stage === "database"
    ? {
        dbFinalizerInvocations: 0,
        dbAttempted: 0,
        dbOutcomeUnknown: 0,
        dbTerminal: 0,
        dbNonterminal: 1,
        dbObservedRowCount: null,
        dbDeletedRowCount: null,
        dbAnonymizedRowCount: null,
        dbRetainedRowCount: null
      }
    : {};
}

function authSafeZeroCounts(stage) {
  return stage === "auth"
    ? {
        authDurableRunnerCalls: 0,
        authGetCalls: 0,
        authDeleteDispatches: 0,
        authAttempted: 0,
        authOutcomeUnknown: 0,
        authTerminal: 0,
        authNonterminal: 1,
        verificationAttemptCount: null,
        completionCalls: 0
      }
    : {};
}

function completionSafeZeroCounts(stage) {
  return stage === "completion"
    ? {
        completionRpcCalls: 0,
        completionOutcomeUnknown: 0,
        completionTerminal: 0,
        completionAlreadyCompleted: null,
        externalCalls: 0
      }
    : {};
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

function sanitizeStageServiceResult(result = {}, stage = "") {
  const allowedStatuses = new Set([
    "succeeded",
    "not_needed",
    "already_satisfied",
    "failed",
    "manual_required",
    "blocked"
  ]);
  const databaseAllowedStatuses = new Set(["succeeded", "not_needed", "manual_required", "blocked"]);
  const authAllowedStatuses = new Set(["succeeded", "not_needed", "failed", "manual_required", "blocked"]);
  const completionAllowedStatuses = new Set(["succeeded", "already_satisfied", "manual_required", "blocked"]);
  const safeCounts = result.safeCounts && typeof result.safeCounts === "object" ? result.safeCounts : {};
  const rawDatabaseTerminal = result.status === "succeeded" || result.status === "not_needed";
  const rawDatabaseEvidence = {
    observed: result.safeCounts?.dbObservedRowCount,
    deleted: result.safeCounts?.dbDeletedRowCount,
    anonymized: result.safeCounts?.dbAnonymizedRowCount,
    retained: result.safeCounts?.dbRetainedRowCount
  };
  const rawDatabaseEvidenceSafe = Object.values(rawDatabaseEvidence).every(
    (value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0
  );
  const rawDatabaseEquationValid =
    rawDatabaseEvidenceSafe &&
    rawDatabaseEvidence.observed ===
      rawDatabaseEvidence.deleted + rawDatabaseEvidence.anonymized + rawDatabaseEvidence.retained &&
    (result.status === "not_needed"
      ? rawDatabaseEvidence.deleted === 0 && rawDatabaseEvidence.anonymized === 0
      : result.status === "succeeded" && rawDatabaseEvidence.deleted + rawDatabaseEvidence.anonymized > 0);
  const rawDatabaseTerminalSurfaceValid =
    !rawDatabaseTerminal ||
    (result.safeProgress?.terminal === true &&
      rawDatabaseEquationValid &&
      result.safeCounts?.dbFinalizerInvocations === 1 &&
      result.safeCounts?.dbAttempted === 1 &&
      result.safeCounts?.dbOutcomeUnknown === 0 &&
      result.safeCounts?.dbTerminal === 1 &&
      result.safeCounts?.dbNonterminal === 0 &&
      result.safeCounts?.destructiveOperationsAttempted === 1);
  const databaseRuntimeUnknown =
    stage === "database" &&
    (!databaseAllowedStatuses.has(result.status) || !rawDatabaseTerminalSurfaceValid);
  const rawAuthTerminal = result.status === "succeeded" || result.status === "not_needed";
  const rawAuthActionCountsSafe = [
    safeCounts.authDurableRunnerCalls,
    safeCounts.authGetCalls,
    safeCounts.authDeleteDispatches,
    safeCounts.authAttempted,
    safeCounts.authOutcomeUnknown,
    safeCounts.authTerminal,
    safeCounts.authNonterminal,
    safeCounts.completionCalls,
    safeCounts.destructiveOperationsAttempted
  ].every((value) => typeof value === "number" && Number.isSafeInteger(value) && value >= 0);
  const rawAuthVerificationCountSafe = safeCounts.verificationAttemptCount === null ||
    (typeof safeCounts.verificationAttemptCount === "number" &&
      Number.isSafeInteger(safeCounts.verificationAttemptCount) &&
      safeCounts.verificationAttemptCount >= 0);
  const rawAuthBoundaryValid = rawAuthActionCountsSafe && rawAuthVerificationCountSafe &&
    safeCounts.authGetCalls <= 2 && safeCounts.authDeleteDispatches <= 1 &&
    safeCounts.authAttempted === safeCounts.authDeleteDispatches &&
    safeCounts.destructiveOperationsAttempted === safeCounts.authDeleteDispatches &&
    safeCounts.completionCalls === 0;
  const rawAuthReasonValid = rawAuthTerminal
    ? result.safeReasonCode === null
    : typeof result.safeReasonCode === "string" && AUTH_OPERATOR_SAFE_REASON_CODES.has(result.safeReasonCode);
  const rawAuthTerminalSurfaceValid = !rawAuthTerminal ||
    (rawAuthBoundaryValid &&
      result.safeProgress?.marker === "terminal" &&
      result.safeProgress?.terminal === true &&
      result.safeProgress?.verifiedAbsent === true &&
      result.safeProgress?.authSubFinalized === true &&
      safeCounts.authDurableRunnerCalls === 1 &&
      safeCounts.authOutcomeUnknown === 0 &&
      safeCounts.authTerminal === 1 &&
      safeCounts.authNonterminal === 0 &&
      typeof safeCounts.verificationAttemptCount === "number" &&
      safeCounts.verificationAttemptCount >= 1);
  const rawAuthNonterminalSurfaceValid = rawAuthTerminal ||
    (rawAuthBoundaryValid &&
      result.safeProgress?.terminal === false &&
      safeCounts.authTerminal === 0 &&
      safeCounts.authNonterminal === 1);
  const authRuntimeUnknown = stage === "auth" &&
    (!authAllowedStatuses.has(result.status) || !rawAuthReasonValid ||
      !rawAuthTerminalSurfaceValid || !rawAuthNonterminalSurfaceValid);
  const rawCompletionTerminalStatus = result.status === "succeeded" || result.status === "already_satisfied";
  const rawCompletionRpcCalls = safeCounts.completionRpcCalls;
  const rawCompletionOutcomeUnknown = safeCounts.completionOutcomeUnknown;
  const rawCompletionTerminal = safeCounts.completionTerminal;
  const rawCompletionAlreadyCompleted = safeCounts.completionAlreadyCompleted;
  const sanitizedCompletionRpcCalls =
    rawCompletionRpcCalls === 0 || rawCompletionRpcCalls === 1 ? rawCompletionRpcCalls : null;
  const rawCompletionTerminalAuthorityMissingRpcValid =
    result.safeReasonCode !== "completion_terminal_authority_missing" || rawCompletionRpcCalls === 1;
  const rawCompletionBoundaryValid =
    sanitizedCompletionRpcCalls !== null &&
    (rawCompletionOutcomeUnknown === 0 || rawCompletionOutcomeUnknown === 1) &&
    (rawCompletionTerminal === null || rawCompletionTerminal === 0 || rawCompletionTerminal === 1) &&
    (rawCompletionAlreadyCompleted === null || rawCompletionAlreadyCompleted === 0 || rawCompletionAlreadyCompleted === 1) &&
    safeCounts.externalCalls === 0 &&
    safeCounts.destructiveOperationsAttempted === 0 &&
    result.safeProgress?.terminal === (rawCompletionTerminal === 1);
  const rawCompletionTerminalSurfaceValid = !rawCompletionTerminalStatus ||
    (result.safeReasonCode === null &&
      result.safeProgress?.marker === "terminal" &&
      rawCompletionRpcCalls === 1 &&
      rawCompletionOutcomeUnknown === 0 &&
      rawCompletionTerminal === 1 &&
      rawCompletionAlreadyCompleted === (result.status === "already_satisfied" ? 1 : 0));
  const rawCompletionRejectedSurfaceValid =
    result.status !== "blocked" || result.safeReasonCode !== "completion_rpc_rejected" ||
    (result.safeProgress?.marker === "completion_rpc_rejected" &&
      rawCompletionRpcCalls === 1 && rawCompletionOutcomeUnknown === 0 &&
      rawCompletionTerminal === 0 && rawCompletionAlreadyCompleted === null);
  const rawCompletionPrecheckSurfaceValid =
    result.status !== "blocked" || result.safeReasonCode !== "completion_cleanup_not_runnable" ||
    (result.safeProgress?.marker === "not_runnable" &&
      rawCompletionRpcCalls === 0 && rawCompletionOutcomeUnknown === 0 &&
      rawCompletionTerminal === 0 && rawCompletionAlreadyCompleted === null);
  const rawCompletionUnknownSurfaceValid = result.status !== "manual_required" ||
    ((result.safeReasonCode === "completion_stage_result_unknown" ||
      result.safeReasonCode === "completion_terminal_authority_missing") &&
      result.safeProgress?.marker === "unknown" &&
      rawCompletionOutcomeUnknown === 1 && rawCompletionTerminal === null &&
      rawCompletionAlreadyCompleted === null &&
      rawCompletionTerminalAuthorityMissingRpcValid);
  const rawCompletionReasonValid = rawCompletionTerminalStatus
    ? result.safeReasonCode === null
    : typeof result.safeReasonCode === "string" &&
      COMPLETION_OPERATOR_SAFE_REASON_CODES.has(result.safeReasonCode);
  const rawCompletionStatusReasonValid =
    (rawCompletionTerminalStatus && result.safeReasonCode === null) ||
    (result.status === "blocked" &&
      (result.safeReasonCode === "completion_rpc_rejected" ||
        result.safeReasonCode === "completion_cleanup_not_runnable")) ||
    (result.status === "manual_required" &&
      (result.safeReasonCode === "completion_stage_result_unknown" ||
        result.safeReasonCode === "completion_terminal_authority_missing"));
  const completionRuntimeUnknown = stage === "completion" &&
    (!completionAllowedStatuses.has(result.status) || !rawCompletionBoundaryValid ||
      !rawCompletionReasonValid || !rawCompletionStatusReasonValid || !rawCompletionTerminalSurfaceValid ||
      !rawCompletionRejectedSurfaceValid || !rawCompletionPrecheckSurfaceValid ||
      !rawCompletionUnknownSurfaceValid);
  const status = databaseRuntimeUnknown || authRuntimeUnknown || completionRuntimeUnknown
    ? "manual_required"
    : allowedStatuses.has(result.status)
      ? result.status
      : "blocked";
  const satisfied = status === "succeeded" || status === "not_needed" || status === "already_satisfied";
  const allowedProgressMarkers = new Set([
    "seal_only",
    "progressed",
    "retry_later",
    "manual_required",
    "target_verified",
    "terminal",
    "busy",
    "not_runnable",
    "stale_result",
    "completion_rpc_rejected",
    "blocked",
    "unknown"
  ]);
  const progressMarker = authRuntimeUnknown || completionRuntimeUnknown
    ? "unknown"
    : allowedProgressMarkers.has(result.safeProgress?.marker)
      ? result.safeProgress.marker
      : satisfied
        ? "terminal"
        : "unknown";
  const retryable = !authRuntimeUnknown && !completionRuntimeUnknown && !satisfied &&
    result.safeProgress?.retryable === true;
  const manualReviewRequired =
    databaseRuntimeUnknown || authRuntimeUnknown || completionRuntimeUnknown || status === "manual_required" ||
    result.safeProgress?.manualReviewRequired === true;

  return {
    status,
    safeReasonCode:
      authRuntimeUnknown
        ? "auth_durable_stage_result_unknown"
        : completionRuntimeUnknown
        ? "completion_stage_result_unknown"
        : databaseRuntimeUnknown
        ? "database_stage_result_unknown"
        : stage === "auth"
          ? toSafeAuthReasonCode(result.safeReasonCode, status)
        : stage === "completion"
          ? toSafeCompletionReasonCode(result.safeReasonCode, status)
        : result.safeReasonCode === null && satisfied
          ? null
          : toSafeReasonCode(result.safeReasonCode),
    safeCounts: {
      stagesRequested: 1,
      requestResolverCalls: toSafeNonNegativeNumber(safeCounts.requestResolverCalls),
      stageServiceCalls: 1,
      destructiveOperationsAttempted: stage === "completion"
        ? 0
        : stage === "auth"
        ? toSafeNullableEvidenceNumber(safeCounts.destructiveOperationsAttempted)
        : toSafeNullableNonNegativeNumber(safeCounts.destructiveOperationsAttempted),
      providerCandidates: toSafeNullableNonNegativeNumber(safeCounts.providerCandidates),
      providerAttempted: toSafeNullableNonNegativeNumber(safeCounts.providerAttempted),
      providerSucceeded: toSafeNullableNonNegativeNumber(safeCounts.providerSucceeded),
      providerFailed: toSafeNullableNonNegativeNumber(safeCounts.providerFailed),
      providerNotNeeded: toSafeNullableNonNegativeNumber(safeCounts.providerNotNeeded),
      providerBlocked: toSafeNullableNonNegativeNumber(safeCounts.providerBlocked),
      providerOutcomeUnknown: toSafeNonNegativeNumber(safeCounts.providerOutcomeUnknown),
      providerSnapshotSeals: toSafeNonNegativeNumber(safeCounts.providerSnapshotSeals),
      providerDurableRunnerCalls: toSafeNonNegativeNumber(safeCounts.providerDurableRunnerCalls),
      providerExternalActions: toSafeNonNegativeNumber(safeCounts.providerExternalActions),
      providerTerminal: toSafeNonNegativeNumber(safeCounts.providerTerminal),
      providerNonterminal: toSafeNonNegativeNumber(safeCounts.providerNonterminal),
      storageAttempted: toSafeNonNegativeNumber(safeCounts.storageAttempted),
      storageSealAttempts: toSafeNonNegativeNumber(safeCounts.storageSealAttempts),
      storageInventoryReads: toSafeNonNegativeNumber(safeCounts.storageInventoryReads),
      storageRunnerInvocations: toSafeNonNegativeNumber(safeCounts.storageRunnerInvocations),
      storageExternalActions: toSafeNonNegativeNumber(safeCounts.storageExternalActions),
      storageDeleteActions: toSafeNonNegativeNumber(safeCounts.storageDeleteActions),
      storageVerificationActions: toSafeNonNegativeNumber(safeCounts.storageVerificationActions),
      storageOutcomeUnknown: toSafeNonNegativeNumber(safeCounts.storageOutcomeUnknown),
      storageTerminal: toSafeNonNegativeNumber(safeCounts.storageTerminal),
      storageNonterminal: toSafeNonNegativeNumber(safeCounts.storageNonterminal),
      storageObjects: toSafeNonNegativeNumber(safeCounts.storageObjects),
      dbFinalizerInvocations: toSafeNonNegativeNumber(safeCounts.dbFinalizerInvocations),
      dbAttempted: toSafeNonNegativeNumber(safeCounts.dbAttempted),
      dbOutcomeUnknown: databaseRuntimeUnknown
        ? 1
        : toSafeNonNegativeNumber(safeCounts.dbOutcomeUnknown),
      dbTerminal: databaseRuntimeUnknown ? 0 : toSafeNonNegativeNumber(safeCounts.dbTerminal),
      dbNonterminal: databaseRuntimeUnknown ? 1 : toSafeNonNegativeNumber(safeCounts.dbNonterminal),
      dbObservedRowCount:
        stage === "database" && (!rawDatabaseTerminal || databaseRuntimeUnknown)
          ? null
          : toSafeNullableEvidenceNumber(safeCounts.dbObservedRowCount),
      dbDeletedRowCount:
        stage === "database" && (!rawDatabaseTerminal || databaseRuntimeUnknown)
          ? null
          : toSafeNullableEvidenceNumber(safeCounts.dbDeletedRowCount),
      dbAnonymizedRowCount:
        stage === "database" && (!rawDatabaseTerminal || databaseRuntimeUnknown)
          ? null
          : toSafeNullableEvidenceNumber(safeCounts.dbAnonymizedRowCount),
      dbRetainedRowCount:
        stage === "database" && (!rawDatabaseTerminal || databaseRuntimeUnknown)
          ? null
          : toSafeNullableEvidenceNumber(safeCounts.dbRetainedRowCount),
      authDurableRunnerCalls: toSafeNullableEvidenceNumber(safeCounts.authDurableRunnerCalls),
      authGetCalls: toSafeNullableEvidenceNumber(safeCounts.authGetCalls),
      authDeleteDispatches: toSafeNullableEvidenceNumber(safeCounts.authDeleteDispatches),
      authAttempted: toSafeNullableEvidenceNumber(safeCounts.authAttempted),
      authOutcomeUnknown: authRuntimeUnknown
        ? 1
        : toSafeNullableEvidenceNumber(safeCounts.authOutcomeUnknown),
      authTerminal: authRuntimeUnknown ? 0 : toSafeNullableEvidenceNumber(safeCounts.authTerminal),
      authNonterminal: authRuntimeUnknown ? 1 : toSafeNullableEvidenceNumber(safeCounts.authNonterminal),
      verificationAttemptCount: toSafeNullableEvidenceNumber(safeCounts.verificationAttemptCount),
      completionCalls: toSafeNullableEvidenceNumber(safeCounts.completionCalls),
      ...(stage === "completion"
        ? {
            completionRpcCalls:
              rawCompletionTerminalAuthorityMissingRpcValid ? sanitizedCompletionRpcCalls : null,
            completionOutcomeUnknown: completionRuntimeUnknown
              ? 1
              : rawCompletionOutcomeUnknown,
            completionTerminal: completionRuntimeUnknown ? null : rawCompletionTerminal,
            completionAlreadyCompleted: completionRuntimeUnknown ? null : rawCompletionAlreadyCompleted,
            externalCalls: 0
          }
        : {}),
      databaseTables: toSafeNonNegativeNumber(safeCounts.databaseTables),
      authUsers: toSafeNonNegativeNumber(safeCounts.authUsers)
    },
    progress: {
      marker: progressMarker,
      terminal: satisfied && result.safeProgress?.terminal === true,
      retryable,
      manualReviewRequired,
      verifiedAbsent: stage === "auth" && !authRuntimeUnknown && result.safeProgress?.verifiedAbsent === true,
      authSubFinalized: stage === "auth" && !authRuntimeUnknown && result.safeProgress?.authSubFinalized === true
    },
    nextAction:
      satisfied
        ? "Record this safe stage result in the proof template, then stop before the next stage."
        : retryable
          ? "Stop after this one stage step, record the safe progress, and retry only in a later invocation."
          : manualReviewRequired
            ? "Stop at this stage, record the safe reason code, and follow the manual review path."
            : "Stop at this stage, record the safe reason code, and do not advance to a later stage."
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
        "No Provider, Storage, Database, Auth, or Completion service was called.",
        "No raw user id, deletion request id, email, request reference, auth credential, or admin key is printed."
      ]
    };
  }

  if (summary.status !== "ready_for_execution") {
    return summary;
  }

  const resolvedRequest = sanitizeRequestResolverResult(
    await requestResolver({
      stage,
      requestRef: parsed.requestRef,
      proofPath: summary.proof.proofPath,
      envLabel: summary.proof.envLabel
    }),
    stage
  );

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
        "No Provider, Storage, Database, Auth, or Completion stage service was called.",
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
  const safeServiceResult = sanitizeStageServiceResult(serviceResult, stage);

  return {
    ...summary,
    status: safeServiceResult.status,
    safeReasonCode: safeServiceResult.safeReasonCode,
    safeCounts: safeServiceResult.safeCounts,
    progress: safeServiceResult.progress,
    nextAction: safeServiceResult.nextAction,
    guard: {
      ...summary.guard,
      requestResolved: true,
      stageServiceCalled: true
    },
    request: resolvedRequest.safeRequest,
    notes: [
      "Safe request resolver and internal stage service bridge returned safe summaries.",
      "No raw user, provider, storage, DB, Auth, or provider response data is printed.",
      "The canonical entry connects Provider, Storage, Database, Auth, and Completion as separate one-invocation stages."
    ]
  };
}

function printHelp() {
  console.log(`Native Minute account deletion operator runner

Usage:
  npm run account-deletion:operator -- --stage provider --request <request-ref> --dry-run
  npm run account-deletion:operator -- --stage provider --request <request-ref> --execute --proof <proof-doc> --latest-dry-run-runnable --acknowledge-irreversible I_UNDERSTAND_ACCOUNT_DELETION_IS_IRREVERSIBLE

Stages:
  provider | storage | database | auth | completion | status | summary

Safety:
  - dry-run is the default
  - one stage per invocation
  - execute mode is blocked unless ${DESTRUCTIVE_GUARD_ENV}=1 and acknowledgement are present
  - execute mode also requires a prepared proof path and latest dry-run runnable confirmation
  - storage/database/auth/completion execute mode requires --prior-stage-satisfied
  - status/summary can model disposable proof candidacy with --proof-candidate-* flags
  - the canonical entry connects Provider, Storage, Database, Auth, and Completion behind every execute guard
  - Completion is a terminal DB mutation and reports zero external destructive operations
  - raw request refs are accepted for targeting but never echoed
`);
}

export {
  DESTRUCTIVE_GUARD_ENV,
  IRREVERSIBLE_ACKNOWLEDGEMENTS,
  assessDisposableProofCandidate,
  buildSafeSummary,
  parseArgs,
  printHelp,
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

  if (["blocked", "failed", "manual_required"].includes(summary.status)) {
    process.exitCode = 2;
  }
}
