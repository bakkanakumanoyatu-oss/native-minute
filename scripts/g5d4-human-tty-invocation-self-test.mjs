// Offline source isolation only: no injectable seam is exported by the live CLI.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, constants } from "node:fs";
import { connect } from "node:net";
import { join, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import * as evidence from "./g5d4-invocation-evidence.mjs";
import * as contract from "./g5d4-proof-contract.mjs";
import * as state from "./g5d4-proof-private-state.mjs";
import { collectSelfTestInvocationSnapshot } from "./g5d4-read-only-evidence-collector.mjs";
import { runG5d4InvocationSelfTestOnly } from "./g5d4-authorized-step-wrapper.mjs";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const CLI = join(ROOT, "scripts/g5d4-human-tty-invocation.mjs");
const source = readFileSync(CLI, "utf8");
const fixtureSource = readFileSync(new URL("./g5d4-invocation-evidence-self-test.mjs", import.meta.url), "utf8");
const fixtureStart = fixtureSource.indexOf("const clone =");
const fixtureEnd = fixtureSource.indexOf("for (const n of [0, 1, 4]) test");
assert.ok(fixtureStart > 0 && fixtureEnd > fixtureStart);
const fixtures = runInNewContext(`${fixtureSource.slice(fixtureStart, fixtureEnd)}\n({context, inspection, actual})`, {
  ...evidence, ...contract, structuredClone
});
const body = source.slice(source.indexOf("const EFFECTS ="), source.indexOf("if (process.argv[1]"));
assert.ok(body.includes("async function main(args)"));
const clone = value => structuredClone(value);
const defaultArgs = ["--context-directory", "/synthetic-private-context", "--expected-stage", "storage", "--expected-action", "verify"];

function referencePending() {
  const raw = fixtures.actual();
  raw.b.auth.evidence.contact = "synthetic@example.invalid";
  raw.b.auth.evidence.secretSentinel = "synthetic-secret-never-print";
  raw.request.provider_cleanup_status = "succeeded";
  raw.request.provider_sub_finalized_at = "2026-09-02T00:00:00.000Z";
  raw.providerTargets[0].status = "verified_absent";
  raw.providerTargets[0].reconciliation_status = "verified_absent";
  raw.a.provider.state = "absent"; raw.a.provider.evidence = null;
  raw.a.storage.state = "absent"; raw.a.storage.evidence = [];
  for (const target of raw.storageTargets) {
    target.delete_attempt_count = 1; target.delete_outcome = "succeeded";
    target.status = target.target_kind === "script_audio" ? "delete_requested" : "verified_absent";
    target.verification_status = target.target_kind === "script_audio" ? "pending" : "verified_absent";
  }
  evidence.validateActualState(raw, fixtures.context);
  return raw;
}

async function harness(options, check) {
  const directories = [];
  const calls = { ready: 0, inspect: 0, read: 0, collect: 0, confirm: 0, wrapper: 0, launch: 0, close: 0 };
  const events = []; let output = ""; let snapshot; let auth; let entry; let readyAccepted = false;
  const current = { value: referencePending() };
  if (options.unknown) current.value.b.provider.state = "unknown";
  if (options.alreadyVerified) {
    for (const target of current.value.storageTargets) {
      target.status = "verified_absent"; target.verification_status = "verified_absent";
    }
  }
  const reader = {
    inspect: async () => { calls.inspect++; events.push("inspect"); return clone(fixtures.inspection); },
    read: async () => { calls.read++; events.push("read"); return clone(current.value); }
  };
  const api = runInNewContext(`${body}\n({main, parseArguments, checkLocalSource})`, {
    ...evidence, ROOT, Buffer, constants, Date, Object, JSON,
    process: {
      stdin: { isTTY: options.stdinTty ?? true },
      stdout: { isTTY: options.stdoutTty ?? true, write: text => { output += text; events.push("output"); } },
      cwd: () => options.cwd ?? ROOT
    },
    execFileSync: (_cmd, args) => {
      if (args[0] === "status") return options.dirty ? " M scripts/unsafe.mjs\n" : "?? .env.local.save\n?? supabase/.temp/\n";
      if (args[0] === "branch") return options.branch ?? "codex/g3-mobile-main-loop";
      if (args[1] === "--show-toplevel") return ROOT;
      if (args[1] === "@{upstream}" && options.unsynced) return "b".repeat(40);
      if (readyAccepted && options.sourceDrift) return "b".repeat(40);
      return fixtures.inspection.git.commit;
    },
    openSync: (path, flags) => { assert.equal(path, "/dev/tty"); assert.ok(flags & constants.O_RDWR); if (options.noControllingTty) throw new Error("private-secret"); return 90; },
    isatty: fd => fd === 90 && !options.fdNotTty,
    closeSync: () => { calls.close++; },
    writeFileSync: (_fd, text) => { output += text; events.push("ready_prompt"); },
    readSync: (_fd, bytes) => {
      assert.equal(calls.collect, 0); assert.equal(calls.confirm, 0); assert.equal(calls.wrapper, 0);
      assert.equal(calls.read, 0); assert.equal(directories.length, 0);
      calls.ready++; events.push("ready_input");
      options.onReady?.(calls);
      const value = Buffer.from(options.ready ?? "READY\n"); value.copy(bytes);
      readyAccepted = /^READY\r?\n$/.test(value.toString());
      return value.length;
    },
    assertSecureRunDirectory: path => { assert.equal(path, defaultArgs[1]); return path; },
    readInvocationContext: (_directory, purpose) => { assert.equal(purpose, "live"); return fixtures.context; },
    createLiveReadOnlyAdapters: () => { assert.equal(readyAccepted, true); return { invocation: reader }; },
    createInvocationPrivateRun: context => {
      assert.equal(readyAccepted, true);
      const directory = state.createInvocationPrivateRun(context); directories.push(directory); return directory;
    },
    collectLiveInvocationSnapshot: async (directory, spec) => {
      calls.collect++; events.push("collect"); assert.equal(calls.collect, 1);
      if (options.collectionDrift) current.value.b.auth.evidence.confirmed = false;
      return collectSelfTestInvocationSnapshot(directory, spec, reader);
    },
    readInvocationSnapshot: (directory, path, purpose) => {
      assert.equal(purpose, "live"); snapshot = state.readInvocationSnapshot(directory, path, "self_test"); return snapshot;
    },
    confirmLiveInvocationFromTty: async (directory, path) => {
      calls.confirm++; events.push("confirm");
      assert.equal(events.at(-2), "output", "safe summary immediately before existing confirmation");
      if (options.authReject) throw new Error(`secret:${fixtures.context.a.userId}`);
      auth = await state.confirmSelfTestInvocation(directory, path);
      if (options.reused) state.consumeInvocationAuthorization(directory, auth.path, snapshot);
      if (options.preDispatchDrift) current.value.b.auth.evidence.confirmed = false;
      return auth;
    },
    assertFreshInvocation: value => evidence.assertFreshInvocation(value,
      options.expired && calls.confirm ? Date.parse(value.collectedAt) + 300001 : Date.now()),
    runG5d4AuthorizedStep: async input => {
      calls.wrapper++; events.push("wrapper"); entry = input;
      assert.equal(calls.wrapper, 1); assert.equal(input.confirmedAuthorizationPath, auth.path);
      return runG5d4InvocationSelfTestOnly(input, reader, async () => {
        calls.launch++; events.push("launch");
        if (options.wrapperFailure) throw new Error(`private-secret:${fixtures.context.a.providerId}`);
        const target = current.value.storageTargets.find(t => t.id === snapshot.spec.targetId);
        target.status = "verified_absent"; target.verification_status = "verified_absent";
        if (options.postDrift) current.value.b.auth.evidence.confirmed = false;
        return { exitCode: 0, stdout: JSON.stringify({ status: "succeeded", progress: {
          marker: "target_verified", terminal: false, retryable: false, manualReviewRequired: false
        } }), stderr: "" };
      });
    }
  });
  try {
    const code = await api.main(options.args ?? defaultArgs);
    await check({ code, calls, events, output, snapshot, auth, entry, current, reader, directories });
  } finally { for (const directory of directories) state.cleanupPrivateRunDirectory(directory); }
}

test("OS network deny is active", async () => {
  const denied = await new Promise(resolvePromise => {
    const socket = connect({ host: "127.0.0.1", port: 9 });
    socket.once("error", error => resolvePromise(error.code === "EPERM"));
    socket.once("connect", () => { socket.destroy(); resolvePromise(false); });
    socket.setTimeout(1000, () => { socket.destroy(); resolvePromise(false); });
  });
  assert.equal(denied, true);
});

test("real CLI non-TTY rejects without READY, private state or network", () => {
  const result = spawnSync(process.execPath, [CLI, ...defaultArgs], {
    cwd: ROOT, encoding: "utf8", env: { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, NODE_ENV: "test" }
  });
  assert.equal(result.status, 2); assert.equal(result.stderr, "");
  assert.match(result.stdout, /^STOP:/); assert.ok(!result.stdout.includes("Type READY"));
});

for (const options of [
  { stdinTty: false }, { stdoutTty: false }, { noControllingTty: true }, { fdNotTty: true },
  { ready: "NO\n" }, { ready: "ready\n" }, { ready: " READY\n" }, { ready: "READY \n" },
  { ready: "READY" }, { ready: "" }, { ready: "READY\nAUTHORIZE injected\n" },
  { dirty: true }, { unsynced: true }, { branch: "main" }, { cwd: "/wrong" }, { sourceDrift: true }
]) test(`before READY/clean source rejection ${JSON.stringify(options)}`, async () => {
  await harness(options, ({ code, calls, directories }) => {
    assert.equal(code, 2); assert.equal(calls.collect, 0); assert.equal(calls.confirm, 0);
    assert.equal(calls.wrapper, 0); assert.equal(calls.read, 0); assert.equal(directories.length, 0);
  });
});

for (const args of [
  [...defaultArgs.slice(0, 4), "--expected-action", "delete"],
  ["--context-directory", defaultArgs[1], "--expected-stage", "auth", "--expected-action", "auth_step"]
]) test(`expected mismatch ${args.at(-1)} stops before collection`, async () => {
  await harness({ args }, ({ code, calls }) => {
    assert.equal(code, 2); assert.equal(calls.read, 1); assert.equal(calls.collect, 0);
    assert.equal(calls.confirm, 0); assert.equal(calls.wrapper, 0);
  });
});

for (const args of [
  [], [...defaultArgs, "--target-id", "00000000-0000-4000-8000-000000000001"],
  ["--context-directory", defaultArgs[1], "--expected-stage", "storage", "--expected-stage", "storage"],
  [...defaultArgs.slice(0, 4), "--expected-action", "replay"]
]) test(`invalid/raw selector arguments reject (${args.length}/${args.at(-1) ?? "empty"})`, async () => {
  await harness({ args }, ({ code, calls, output }) => {
    assert.equal(code, 2); assert.equal(calls.ready, 0); assert.equal(calls.collect, 0); assert.equal(calls.wrapper, 0);
    assert.ok(!output.includes("00000000-"));
  });
});

for (const options of [{ authReject: true }, { expired: true }, { collectionDrift: true }]) {
  test(`pre-dispatch ${JSON.stringify(options)} has zero wrapper calls`, async () => {
    await harness(options, ({ code, calls, output }) => {
      assert.equal(code, 2); assert.equal(calls.collect, 1); assert.equal(calls.wrapper, 0); assert.equal(calls.launch, 0);
      assert.ok(!output.includes("secret:"));
    });
  });
}

for (const options of [{ unknown: true }, { alreadyVerified: true }]) {
  test(`current state rejects ${JSON.stringify(options)} before snapshot/auth`, async () => {
    await harness(options, ({ code, calls }) => {
      assert.equal(code, 2); assert.equal(calls.collect, 0); assert.equal(calls.confirm, 0); assert.equal(calls.wrapper, 0);
    });
  });
}

test("TTY CRLF READY accepted exactly once", async () => {
  await harness({ ready: "READY\r\n" }, ({ code, calls }) => {
    assert.equal(code, 0); assert.equal(calls.collect, 1); assert.equal(calls.launch, 1);
  });
});

test("READY-first reference verify: one fresh snapshot, existing auth/wrapper/reconciliation; no next finalize", async () => {
  await harness({ onReady: calls => assert.equal(calls.collect, 0) }, async ({ code, calls, output, snapshot, current, entry, reader, auth, directories }) => {
    assert.equal(code, 0); assert.equal(calls.collect, 1); assert.equal(calls.confirm, 1);
    assert.equal(calls.wrapper, 1); assert.equal(calls.launch, 1); assert.equal(calls.close, 1);
    assert.equal(snapshot.spec.action, "verify"); assert.equal(snapshot.spec.maxCalls, 1);
    const lines = output.trim().split("\n"); const summary = JSON.parse(lines[1]); const result = JSON.parse(lines[2]);
    assert.equal(summary.targetCategory, "reference_audio"); assert.equal(summary.action, "verify");
    assert.equal(Date.parse(summary.expiresAt) - Date.parse(snapshot.collectedAt), 300000);
    assert.match(summary.fixtureA, /^g5d4_v1[0-9a-f]{64}$/); assert.match(summary.expectedEffect, /No DELETE/);
    assert.match(summary.excluded, /User B/); assert.equal(result.verdict, "PASS");
    assert.deepEqual(summary.excludedStages, ["provider", "database", "auth", "completion"]);
    assert.ok(summary.excludedSameStageActions.includes("delete") && summary.excludedSameStageActions.includes("finalize"));
    assert.equal(result.retryCount, 0); assert.equal(result.chainingCount, 0);
    for (const secret of [fixtures.context.a.userId, fixtures.context.b.userId, fixtures.context.requestId,
      fixtures.context.a.providerId, fixtures.context.b.providerId, ...fixtures.context.a.storage.map(x => x.key),
      "synthetic@example.invalid", "synthetic-secret-never-print", auth.path, directories[0]]) assert.ok(!output.includes(secret));
    assert.ok(current.value.storageTargets.every(t => t.status === "verified_absent" && t.delete_attempt_count === 1));
    assert.equal(evidence.plannedInvocation(current.value, fixtures.context, "storage").action, "finalize");
    assert.equal(current.value.request.storage_cleanup_status, "pending", "no auto-finalize");
    const readsAfterRun = calls.read;
    // Re-use the SAME consumed authorization: existing wrapper refuses dispatch.
    const reused = await runG5d4InvocationSelfTestOnly(entry, reader, async () => { assert.fail("second dispatch"); });
    assert.equal(reused.verdict, "REJECT"); assert.equal(reused.invocationCount, 0);
    assert.ok(readsAfterRun >= 4, "fresh collection plus immediate post-read");
  });
});

for (const options of [{ wrapperFailure: true }, { postDrift: true }, { preDispatchDrift: true }, { reused: true }]) {
  test(`wrapper rejects without retry/chaining ${JSON.stringify(options)}`, async () => {
    await harness(options, ({ code, calls, events, output }) => {
      assert.equal(code, 2); assert.equal(calls.wrapper, 1); assert.equal(calls.collect, 1);
      assert.equal(calls.launch, options.preDispatchDrift || options.reused ? 0 : 1);
      if (calls.launch) assert.ok(events.lastIndexOf("read") > events.indexOf("launch"), "immediate reconciliation even on failure");
      assert.match(output, /"retryCount":0,"chainingCount":0/); assert.ok(!output.includes("private-secret"));
    });
  });
}

test("live CLI only imports maintained collector/auth/wrapper; no test injection/child transport", () => {
  assert.ok(!/export\s/.test(source));
  for (const name of ["collectLiveInvocationSnapshot", "confirmLiveInvocationFromTty", "runG5d4AuthorizedStep"]) {
    assert.equal((source.match(new RegExp(`await ${name}\\(`, "g")) ?? []).length, 1);
  }
  assert.ok(!source.includes("confirmSelfTest")); assert.ok(!source.includes("--internal-child-fd"));
  assert.ok(!source.includes("process.env")); assert.ok(!source.includes("node -e"));
  assert.ok(!source.includes("readline"));
});
