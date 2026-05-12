#!/usr/bin/env node

const DESTRUCTIVE_GUARD_ENV = "NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE";
const REHEARSAL_STAGES = ["provider", "storage", "database", "auth", "completion"];

function parseRehearsalArgs(argv = []) {
  const parsed = {
    format: "json",
    checkedAt: "",
    operatorMarker: "",
    reviewerMarker: "",
    approverMarker: "",
    envLabel: "",
    proofTemplate: "",
    help: false,
    unknown: []
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "--format":
        parsed.format = argv[index + 1] ?? "json";
        index += 1;
        break;
      case "--checked-at":
        parsed.checkedAt = argv[index + 1] ?? "";
        index += 1;
        break;
      case "--operator-marker":
        parsed.operatorMarker = argv[index + 1] ?? "";
        index += 1;
        break;
      case "--reviewer-marker":
        parsed.reviewerMarker = argv[index + 1] ?? "";
        index += 1;
        break;
      case "--approver-marker":
        parsed.approverMarker = argv[index + 1] ?? "";
        index += 1;
        break;
      case "--env-label":
        parsed.envLabel = argv[index + 1] ?? "";
        index += 1;
        break;
      case "--proof-template":
        parsed.proofTemplate = argv[index + 1] ?? "";
        index += 1;
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

function markerState(value) {
  return typeof value === "string" && value.trim().length > 0 ? "provided_not_echoed" : "not_provided";
}

function normalizeFormat(value) {
  return value === "markdown" ? "markdown" : "json";
}

function normalizeCheckedAt(value, now = new Date()) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
    return value;
  }

  return now.toISOString();
}

function buildStageProof(stage) {
  const byStage = {
    provider: {
      safeCounts: { providerCandidates: 2 },
      safeReasonCode: "fake_provider_rehearsal_succeeded",
      nextAction: "For real proof, run provider cleanup as the first one-stage invocation and stop for review."
    },
    storage: {
      safeCounts: { storageObjects: 4 },
      safeReasonCode: "fake_storage_rehearsal_succeeded",
      nextAction: "For real proof, run storage cleanup only after provider cleanup is succeeded or not_needed."
    },
    database: {
      safeCounts: { databaseTables: 10 },
      safeReasonCode: "fake_database_rehearsal_succeeded",
      nextAction: "For real proof, run DB cleanup only after provider and storage stages are satisfied."
    },
    auth: {
      safeCounts: { authUsers: 1 },
      safeReasonCode: "fake_auth_rehearsal_succeeded",
      nextAction: "For real proof, run Auth deletion last and only after DB cleanup is satisfied."
    },
    completion: {
      safeCounts: { completionRecords: 1 },
      safeReasonCode: "fake_completion_rehearsal_succeeded",
      nextAction: "For real proof, record completed tracking only after Auth deletion succeeds."
    }
  };

  return {
    stage,
    decision: "PASS",
    status: "rehearsed",
    safeCounts: byStage[stage].safeCounts,
    safeReasonCode: byStage[stage].safeReasonCode,
    nextAction: byStage[stage].nextAction
  };
}

function generateFakeOnlyProofLog(input = {}, env = process.env) {
  const destructiveGuardEnabled = env[DESTRUCTIVE_GUARD_ENV] === "1";
  const blocked = destructiveGuardEnabled || (Array.isArray(input.unknown) && input.unknown.length > 0);
  const safeReasonCode =
    (destructiveGuardEnabled && "destructive_guard_enabled_for_fake_rehearsal") ||
    (Array.isArray(input.unknown) && input.unknown.length > 0 && "unknown_arguments") ||
    null;

  return {
    type: "account_deletion_fake_only_rehearsal",
    version: "rr-3n",
    mode: "fake_only",
    checkedAt: normalizeCheckedAt(input.checkedAt, input.now),
    overallDecision: blocked ? "BLOCKED" : "PASS",
    safeReasonCode,
    markers: {
      operator: markerState(input.operatorMarker),
      reviewer: markerState(input.reviewerMarker),
      approver: markerState(input.approverMarker),
      environment: markerState(input.envLabel),
      proofTemplate: markerState(input.proofTemplate)
    },
    proofMarker: "rr3n_fake_rehearsal_no_real_cleanup",
    sequence: {
      stageOrder: REHEARSAL_STAGES,
      rehearsalBundlesStages: true,
      realExecutionPolicy: "one_stage_per_invocation"
    },
    stages: blocked ? [] : REHEARSAL_STAGES.map((stage) => buildStageProof(stage)),
    safety: {
      destructiveGuardEnabled,
      realProviderCleanupCalled: false,
      realStorageCleanupCalled: false,
      realDatabaseCleanupCalled: false,
      realAuthDeletionCalled: false,
      publicUiOrApiAdded: false,
      dbMigrationChanged: false
    },
    forbiddenDataPolicy: [
      "Do not record raw user id, email, request id, provider id, storage path, object key, signed URL, DB row id, transcript, script body, token, service role key, or raw provider response.",
      "Use safe markers, safe counts, safe reason codes, and stage decisions only."
    ],
    nextAction: blocked
      ? "Disable destructive guard or remove unknown arguments, then rerun fake-only rehearsal. Do not run destructive cleanup."
      : "Copy safe stage decisions and counts into the RR-3f proof template. This rehearsal does not authorize destructive proof."
  };
}

function formatFakeOnlyProofLog(log, format = "json") {
  if (normalizeFormat(format) === "markdown") {
    const stageRows = log.stages
      .map(
        (stage) =>
          `| ${stage.stage} | ${stage.decision} | ${stage.status} | ${stage.safeReasonCode} | ${JSON.stringify(stage.safeCounts)} |`
      )
      .join("\n");

    return [
      "# Account Deletion Fake-Only Proof Rehearsal",
      "",
      `- checked_at: ${log.checkedAt}`,
      `- mode: ${log.mode}`,
      `- overall_decision: ${log.overallDecision}`,
      `- safe_reason_code: ${log.safeReasonCode ?? "none"}`,
      `- proof_marker: ${log.proofMarker}`,
      `- operator_marker: ${log.markers.operator}`,
      `- reviewer_marker: ${log.markers.reviewer}`,
      `- approver_marker: ${log.markers.approver}`,
      `- environment_marker: ${log.markers.environment}`,
      `- real_execution_policy: ${log.sequence.realExecutionPolicy}`,
      "",
      "| stage | decision | status | safe_reason_code | safe_counts |",
      "| --- | --- | --- | --- | --- |",
      stageRows || "| none | BLOCKED | not_run | no_stage_rehearsal | {} |",
      "",
      `Next action: ${log.nextAction}`
    ].join("\n");
  }

  return JSON.stringify(log, null, 2);
}

function printHelp() {
  console.log(`Native Minute account deletion fake-only rehearsal

Usage:
  npm run account-deletion:operator:rehearsal -- --format json
  npm run account-deletion:operator:rehearsal -- --format markdown --operator-marker operator --reviewer-marker reviewer --approver-marker approver

Safety:
  - fake-only rehearsal never calls provider, Storage, DB, or Auth deletion services
  - if ${DESTRUCTIVE_GUARD_ENV}=1 is enabled, rehearsal returns BLOCKED
  - markers are recorded as provided_not_echoed / not_provided; raw names, ids, and emails are not echoed
`);
}

export {
  DESTRUCTIVE_GUARD_ENV,
  REHEARSAL_STAGES,
  formatFakeOnlyProofLog,
  generateFakeOnlyProofLog,
  parseRehearsalArgs
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const parsed = parseRehearsalArgs(process.argv.slice(2));

  if (parsed.help) {
    printHelp();
    process.exit(0);
  }

  const log = generateFakeOnlyProofLog(parsed, process.env);
  console.log(formatFakeOnlyProofLog(log, parsed.format));

  if (log.overallDecision === "BLOCKED") {
    process.exitCode = 2;
  }
}
