#!/usr/bin/env node

import {
  REHEARSAL_STAGES,
  formatFakeOnlyProofLog,
  generateFakeOnlyProofLog,
  parseRehearsalArgs
} from "./account-deletion-operator-rehearsal.mjs";

function printCheck(label, ok, detail) {
  console.log(`- ${label}: ${ok ? "ok" : "failed"}${detail ? ` (${detail})` : ""}`);
}

function assertCheck(label, ok, detail) {
  printCheck(label, ok, detail);

  if (!ok) {
    throw new Error(label);
  }
}

function assertSafeOutput(label, value) {
  const output = typeof value === "string" ? value : JSON.stringify(value);
  const forbidden = [
    "user_raw_should_not_echo",
    "secret@example.com",
    "request_raw_should_not_echo",
    "provider_voice_raw_should_not_echo",
    "storage/path/raw/should/not/echo",
    "object_key_raw_should_not_echo",
    "signed_url_raw_should_not_echo",
    "row_raw_should_not_echo",
    "transcript raw should not echo",
    "script body raw should not echo",
    "token_raw_should_not_echo",
    "service_role_raw_should_not_echo",
    "raw provider response should not echo"
  ];

  assertCheck(
    label,
    forbidden.every((needle) => !output.includes(needle)),
    "fake rehearsal output redacts raw fixture values"
  );
}

console.log("Native Minute account deletion operator rehearsal self-test");
console.log("- scope: fake-only proof log generation; no destructive services are called");

const fixedNow = new Date("2026-05-09T00:00:00.000Z");
const parsed = parseRehearsalArgs([
  "--format",
  "json",
  "--operator-marker",
  "operator_raw_should_not_echo",
  "--reviewer-marker",
  "secret@example.com",
  "--approver-marker",
  "user_raw_should_not_echo",
  "--env-label",
  "production_project_raw_should_not_echo",
  "--proof-template",
  "storage/path/raw/should/not/echo"
]);

const log = generateFakeOnlyProofLog({ ...parsed, now: fixedNow }, {});

assertCheck(
  "fake-only proof log returns PASS when destructive guard is disabled",
  log.overallDecision === "PASS" &&
    log.mode === "fake_only" &&
    log.safety.destructiveGuardEnabled === false &&
    log.safety.realProviderCleanupCalled === false &&
    log.safety.realStorageCleanupCalled === false &&
    log.safety.realDatabaseCleanupCalled === false &&
    log.safety.realAuthDeletionCalled === false,
  "all destructive calls remain false"
);

assertCheck(
  "fake-only rehearsal includes provider -> storage -> database -> auth -> completion",
  JSON.stringify(log.sequence.stageOrder) === JSON.stringify(REHEARSAL_STAGES) &&
    log.stages.map((stage) => stage.stage).join(",") === "provider,storage,database,auth,completion",
  "stage sequence is complete for rehearsal"
);

assertCheck(
  "real execution policy remains one stage per invocation",
  log.sequence.rehearsalBundlesStages === true && log.sequence.realExecutionPolicy === "one_stage_per_invocation",
  "bundled sequence is rehearsal-only"
);

assertCheck(
  "operator/reviewer/approver markers are not echoed",
  log.markers.operator === "provided_not_echoed" &&
    log.markers.reviewer === "provided_not_echoed" &&
    log.markers.approver === "provided_not_echoed" &&
    log.markers.environment === "provided_not_echoed" &&
    log.markers.proofTemplate === "provided_not_echoed",
  "marker presence is recorded without raw values"
);

assertSafeOutput("fake-only proof log JSON is safe", log);

const markdown = formatFakeOnlyProofLog(log, "markdown");
assertCheck(
  "markdown proof output contains safe stage table",
  markdown.includes("| provider | PASS | rehearsed | fake_provider_rehearsal_succeeded |") &&
    markdown.includes("| completion | PASS | rehearsed | fake_completion_rehearsal_succeeded |"),
  "markdown can be copied into proof docs"
);
assertSafeOutput("fake-only proof log markdown is safe", markdown);

const blockedWhenDestructiveGuardEnabled = generateFakeOnlyProofLog(
  { ...parsed, now: fixedNow },
  { NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE: "1" }
);
assertCheck(
  "fake-only rehearsal blocks when destructive guard is enabled",
  blockedWhenDestructiveGuardEnabled.overallDecision === "BLOCKED" &&
    blockedWhenDestructiveGuardEnabled.safeReasonCode === "destructive_guard_enabled_for_fake_rehearsal" &&
    blockedWhenDestructiveGuardEnabled.stages.length === 0,
  "rehearsal must not run while destructive guard is enabled"
);
assertSafeOutput("blocked fake-only rehearsal output is safe", blockedWhenDestructiveGuardEnabled);

const unknownArgsBlocked = generateFakeOnlyProofLog(
  {
    ...parsed,
    unknown: ["request_raw_should_not_echo"],
    now: fixedNow
  },
  {}
);
assertCheck(
  "unknown arguments block rehearsal",
  unknownArgsBlocked.overallDecision === "BLOCKED" && unknownArgsBlocked.safeReasonCode === "unknown_arguments",
  "unexpected CLI inputs are not accepted into proof output"
);
assertSafeOutput("unknown argument rehearsal output is safe", unknownArgsBlocked);

console.log("\nResult: fake-only proof rehearsal output is safe and non-destructive.");
