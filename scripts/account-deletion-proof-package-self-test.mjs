#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const samplePath = join(root, "docs/rr-3o-sample-disposable-proof-package.md");
const sample = readFileSync(samplePath, "utf8");

function printCheck(label, ok, detail) {
  console.log(`- ${label}: ${ok ? "ok" : "failed"}${detail ? ` (${detail})` : ""}`);
}

function assertCheck(label, ok, detail) {
  printCheck(label, ok, detail);

  if (!ok) {
    throw new Error(label);
  }
}

console.log("Native Minute account deletion proof package self-test");
console.log("- scope: fake-only sample proof artifact; no destructive services are called");

const requiredPhrases = [
  "FAKE-ONLY SAMPLE. This is not a real destructive proof.",
  "proof_type | `fake_only_operator_rehearsal`",
  "destructive_guard | `off_required_for_rehearsal`",
  "real_cleanup_executed | `no`",
  "| provider | `PASS` | `rehearsed`",
  "| storage | `PASS` | `rehearsed`",
  "| database | `PASS` | `rehearsed`",
  "| auth | `PASS` | `rehearsed`",
  "| completion | `PASS` | `rehearsed`",
  "PASS_FOR_REHEARSAL_ONLY"
];

assertCheck(
  "sample proof package includes required fake-only fields",
  requiredPhrases.every((phrase) => sample.includes(phrase)),
  "sample has metadata, stage rows, and final rehearsal decision"
);

const forbiddenRegexes = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
  /\badr_[0-9a-f]{32}\b/i,
  /\bsk-[A-Za-z0-9_-]{12,}\b/,
  /\beyJ[A-Za-z0-9_-]{12,}\b/,
  /https?:\/\/[^\s)]+/i,
  /signed[_ -]?url\s*[:=]\s*\S+/i,
  /storage:\/\/[^\s)]+/i,
  /provider[_ -]?voice[_ -]?id\s*[:=]\s*\S+/i,
  /service[_ -]?role[_ -]?key\s*[:=]\s*\S+/i
];

assertCheck(
  "sample proof package contains no raw-looking identifiers or secrets",
  forbiddenRegexes.every((regex) => !regex.test(sample)),
  "raw ids, emails, URLs, tokens, and keys are absent"
);

assertCheck(
  "sample distinguishes rehearsal from real destructive proof",
  sample.includes("Do not use this sample as Store submission evidence.") &&
    sample.includes("Future real disposable proof") &&
    sample.includes("This package can be used to train the operator/reviewer flow"),
  "fake-only and real proof boundaries are explicit"
);

assertCheck(
  "sample lists PASS/WARN/BLOCKED/FAIL conditions",
  ["### PASS", "### WARN", "### BLOCKED", "### FAIL"].every((heading) => sample.includes(heading)),
  "proof package decision outcomes are documented"
);

console.log("\nResult: sample proof package is fake-only, redacted, and non-destructive.");
