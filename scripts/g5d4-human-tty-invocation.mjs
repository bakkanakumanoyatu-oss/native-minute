#!/usr/bin/env node
// Human entry only. Authority, collection, dispatch and reconciliation stay in the existing modules.
import { execFileSync } from "node:child_process";
import { closeSync, constants, openSync, readSync, writeFileSync } from "node:fs";
import { isatty } from "node:tty";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  STAGES, assertFreshInvocation, assertInvocationEnvironment, evidenceAssert, exactEvidence,
  plannedInvocation, stableActualState, stageTerminal, validateActualState
} from "./g5d4-invocation-evidence.mjs";
import {
  assertSecureRunDirectory, createInvocationPrivateRun, readInvocationContext,
  readInvocationSnapshot, confirmLiveInvocationFromTty
} from "./g5d4-proof-private-state.mjs";
import { createLiveReadOnlyAdapters } from "./g5d4-live-read-only-adapters.mjs";
import { collectLiveInvocationSnapshot } from "./g5d4-read-only-evidence-collector.mjs";
import { runG5d4AuthorizedStep } from "./g5d4-authorized-step-wrapper.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EFFECTS = Object.freeze({
  seal: "Seal the current stage target inventory only.",
  delete: "Request external deletion of the one displayed User A target only.",
  verify: "Read-only external GET; persist absence verification for the one displayed User A target. No DELETE.",
  finalize: "Finalize the displayed stage only; Database finalization may delete/anonymize its owned rows.",
  auth_step: "Perform one canonical Auth step for User A; this may delete the Auth user.",
  complete: "Persist Completion only. No external deletion."
});
const STORAGE_CATEGORIES = Object.freeze({
  voice_consent_recording: "consent_recording", voice_sample: "voice_sample",
  recording: "practice_recording", script_audio: "reference_audio"
});

function parseArguments(args) {
  const allowed = ["--context-directory", "--expected-stage", "--expected-action"];
  const values = {};
  evidenceAssert(args.length === 6, "three required CLI options");
  for (let i = 0; i < args.length; i += 2) {
    evidenceAssert(allowed.includes(args[i]) && !Object.hasOwn(values, args[i]) && args[i + 1], "CLI option");
    values[args[i]] = args[i + 1];
  }
  evidenceAssert(STAGES.includes(values["--expected-stage"]), "expected stage");
  evidenceAssert(Object.hasOwn(EFFECTS, values["--expected-action"]), "expected action");
  return values;
}

function checkLocalSource() {
  const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  evidenceAssert(ROOT === "/Users/karasawatakahiro/Developer/native-minute" && process.cwd() === ROOT && git("rev-parse", "--show-toplevel") === ROOT, "Developer root");
  evidenceAssert(git("branch", "--show-current") === "codex/g3-mobile-main-loop", "branch");
  const commit = git("rev-parse", "HEAD");
  evidenceAssert(commit === git("rev-parse", "@{upstream}"), "committed synchronized source");
  evidenceAssert(git("status", "--porcelain", "--untracked-files=normal").split("\n").every(line => !line || ["?? .env.local.save", "?? supabase/.temp/"].includes(line)), "clean source");
  return commit;
}

function requireReadyFromTty() {
  evidenceAssert(process.stdin.isTTY === true && process.stdout.isTTY === true, "interactive terminal streams");
  const fd = openSync("/dev/tty", constants.O_RDWR | (constants.O_NOFOLLOW ?? 0));
  try {
    evidenceAssert(isatty(fd), "controlling terminal");
    writeFileSync(fd, "Type READY to begin fresh authorization flow:\n");
    const bytes = Buffer.alloc(256);
    const length = readSync(fd, bytes, 0, bytes.length, null);
    evidenceAssert(/^READY\r?\n$/.test(bytes.subarray(0, length).toString("utf8")), "exact READY");
  } finally { closeSync(fd); }
}

function targetCategory(snapshot) {
  const { stage, action, targetId } = snapshot.spec;
  if (stage === "storage" && ["delete", "verify"].includes(action)) {
    const target = snapshot.actual.storageTargets.find(item => item.id === targetId);
    evidenceAssert(target && Object.hasOwn(STORAGE_CATEGORIES, target.target_kind), "known Storage category");
    return STORAGE_CATEGORIES[target.target_kind];
  }
  return stage === "provider" && ["delete", "verify"].includes(action) ? "cloned_voice" : "request_stage";
}

async function main(args) {
  try {
    const options = parseArguments(args);
    evidenceAssert(process.stdin.isTTY === true && process.stdout.isTTY === true, "interactive terminal streams");
    const commit = checkLocalSource();
    requireReadyFromTty();
    // Nothing above reads live state, creates a snapshot, or requests authorization.
    exactEvidence(checkLocalSource(), commit, "source during READY wait");
    const sourceDirectory = assertSecureRunDirectory(options["--context-directory"]);
    const context = readInvocationContext(sourceDirectory, "live");
    const reader = createLiveReadOnlyAdapters().invocation;
    const inspected = await reader.inspect();
    assertInvocationEnvironment(inspected.environment, inspected.migrations, inspected.git, commit);
    const actual = validateActualState(await reader.read({ context }), context);
    evidenceAssert(actual.request.status !== "completed", "no completed request replay");
    const stage = STAGES.slice(0, -1).find(value => !stageTerminal(actual.request, value)) ?? "completion";
    const spec = plannedInvocation(actual, context, stage);
    exactEvidence([spec.stage, spec.action], [options["--expected-stage"], options["--expected-action"]], "expected next action");
    // New context/key and snapshot. Never consume a snapshot or authorization from the source directory.
    const runDirectory = createInvocationPrivateRun(context);
    const collected = await collectLiveInvocationSnapshot(runDirectory, spec);
    const snapshot = readInvocationSnapshot(runDirectory, collected.path, "live");
    exactEvidence(snapshot.git.commit, commit, "snapshot source");
    exactEvidence(stableActualState(snapshot.actual), stableActualState(actual), "A/B during collection");
    assertFreshInvocation(snapshot);
    process.stdout.write(`${JSON.stringify({
      ...collected.safe, targetCategory: targetCategory(snapshot), expectedEffect: EFFECTS[spec.action],
      excluded: "User B; other targets/actions; retry; second invocation; chaining; automatic next stage/finalize.",
      excludedStages: STAGES.filter(value => value !== spec.stage),
      excludedSameStageActions: Object.keys(EFFECTS).filter(value => value !== spec.action),
      expiresAt: new Date(Date.parse(snapshot.collectedAt) + 300000).toISOString()
    })}\n`);
    const authorization = await confirmLiveInvocationFromTty(runDirectory, collected.path);
    assertFreshInvocation(snapshot);
    const result = await runG5d4AuthorizedStep({ runDirectory, snapshotPath: collected.path, confirmedAuthorizationPath: authorization.path });
    // The maintained wrapper reconciles before returning. Do not retry, even on REJECT/output loss.
    const pass = result.verdict === "PASS" && result.mandatoryStop === true && result.bUnchanged === true && result.invocationCount === 1;
    process.stdout.write(`${JSON.stringify({ status: "STOP", verdict: pass ? "PASS" : "REJECT",
      snapshotDigest: snapshot.digest, invocationCount: result.invocationCount === 1 ? 1 : 0,
      bUnchanged: result.bUnchanged === true, retryCount: 0, chainingCount: 0 })}\n`);
    return pass ? 0 : 2;
  } catch {
    // Errors may contain private paths, IDs, credentials or response bodies. Never print them.
    process.stdout.write('STOP: flow rejected; no automatic retry. Inspect private evidence before another run.\n');
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await main(process.argv.slice(2));
}
