// Offline only. No real guard, live factory, credentials or canonical operator.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { chmodSync, closeSync, constants, fstatSync, openSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { test } from "node:test";
import { z } from "zod";
import * as state from "./g5d4-proof-private-state.mjs";
import { INVOCATION_VERSION, assertFreshInvocation } from "./g5d4-invocation-evidence.mjs";
import { canonicalJson, hmacSha256Hex, safeDigestEqual } from "./g5d4-proof-contract.mjs";
import { runG5d4AuthorizedStep, runG5d4InvocationSelfTestOnly } from "./g5d4-authorized-step-wrapper.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SELF = fileURLToPath(import.meta.url);
const WRAPPER = join(ROOT, "scripts/g5d4-authorized-step-wrapper.mjs");
const source = readFileSync(WRAPPER, "utf8");
const GUARD = "NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE";
assert.notEqual(process.env[GUARD], "1");
const cleanEnv = { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, TSX_DISABLE_CACHE: "1", NODE_ENV: "test" };
const options = { shell: false, retryCount: 0, chainingCount: 0 };
function section(start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, "wrapper source boundary changed");
  return source.slice(a, b);
}

// Keep the actual read/parse and invocation validation source. Only the VM's
// process object and expected provenance are synthetic. Stop BEFORE git/env,
// child-start publication, dynamic operator import or any live capability.
async function isolatedChildEntry() {
  assert.notEqual(process.env[GUARD], "1");
  if (process.argv.length !== 4 || process.argv[2] !== "--internal-child-fd" || process.argv[3] !== "3") {
    throw new Error("exact FD argv required");
  }
  if (process.env.FD_PROBE === "closed") closeSync(3);
  const entry = section("async function runInternalCanonicalChild(", "const invocationEntrySchema");
  const schema = section("const invocationCapsuleSchema =", "async function runInvocationCore");
  let validation = section("async function runInvocationChild(raw)", "  const git =");
  if (process.env.FD_PROBE !== "live_provenance") {
    validation = validation.replace('capsule.snapshotPath, "live"', 'capsule.snapshotPath, "self_test"');
  }
  const context = {
    assertSecureRunDirectory: state.assertSecureRunDirectory, readAliasKey: state.readAliasKey,
    readInvocationSnapshot: state.readInvocationSnapshot, readInvocationAuthorization: state.readInvocationAuthorization,
    z, INVOCATION_VERSION, assertFreshInvocation, hmacSha256Hex, safeDigestEqual, readFileSync,
    withoutFields: (value, fields) => Object.fromEntries(Object.entries(value).filter(([k]) => !fields.includes(k))),
    DESTRUCTIVE_GUARD_ENV: GUARD,
    // This object exists only in the isolated VM; never installed in process.env.
    process: { env: { G5D4_INTERNAL_CHILD: "1", [GUARD]: "1" } }
  };
  const directory = await runInNewContext(`${schema}\n${entry}\n${validation}\nreturn directory;\n}\nrunInternalCanonicalChild(3)`, context);
  // Also exercise actual tsx TypeScript loading, using only a disposable fixture.
  const typedPath = state.assertSecurePrivateFile(join(directory, "transport-probe.ts"), directory);
  const typed = await import(`file://${typedPath}`);
  assert.equal(typed.value, 42);
  return { status: "PASS", cwd: process.cwd(), fd: 3, regular: fstatSync(3).isFile(), typescript: true };
}

// Execute the current launcher body with real spawn/open/close. The test entry
// replaces only WRAPPER_SCRIPT. Observe the production options, then REMOVE both
// guard flags before OS spawn. No live wrapper entry can run with a guard here.
async function launch(capsulePath, probe = "valid") {
  let seen = 0;
  const launcher = runInNewContext(`${section("async function launchCanonicalOperatorChild(", "export async function runG5d4AuthorizedStep(")}\nlaunchCanonicalOperatorChild`, {
    openSync, closeSync, fsConstants: constants, Buffer, MODULE_ROOT: ROOT, WRAPPER_SCRIPT: SELF,
    DESTRUCTIVE_GUARD_ENV: GUARD, MAX_CHILD_CAPTURE_BYTES: 1024 * 1024,
    process: { execPath: process.execPath, env: cleanEnv },
    spawn: (executable, args, config) => {
      seen++;
      assert.equal(executable, process.execPath);
      assert.deepEqual(Array.from(args), ["--import", "tsx", SELF, "--internal-child-fd", "3"]);
      assert.equal(config.cwd, ROOT); assert.equal(config.shell, false);
      assert.equal(config.env[GUARD], "1"); assert.equal(config.env.G5D4_INTERNAL_CHILD, "1");
      assert.equal(config.stdio[0], "ignore"); assert.ok(fstatSync(config.stdio[3]).isFile());
      const bytes = readFileSync(capsulePath, "utf8");
      for (const channel of [args, config.env]) {
        const serialized = JSON.stringify(channel);
        assert.ok(!serialized.includes(capsulePath)); assert.ok(!serialized.includes(bytes));
      }
      const env = { ...cleanEnv, FD_PROBE: probe };
      let childArgs = Array.from(args), stdio = Array.from(config.stdio);
      if (probe === "absent") stdio = stdio.slice(0, 3);
      if (probe === "wrong_fd") childArgs[childArgs.length - 1] = "4";
      if (probe === "argv_injection") childArgs.push("--authorization", bytes);
      if (probe === "env_injection") { env.AUTHORIZATION = bytes; stdio = stdio.slice(0, 3); }
      if (probe === "stdin_injection") { stdio[0] = "pipe"; stdio = stdio.slice(0, 3); }
      if (probe === "spawn_failure") executable = join(ROOT, "nonexistent-fd-test-node");
      if (probe === "real_entry") childArgs[2] = WRAPPER;
      const child = spawn(executable, childArgs, { ...config, env, stdio });
      if (probe === "stdin_injection") { child.stdin.on("error", () => {}); child.stdin.end(bytes); }
      const timeout = setTimeout(() => child.kill("SIGKILL"), 10000);
      child.once("close", () => clearTimeout(timeout));
      return child;
    }
  });
  const result = await launcher({ capsulePath, spawnOptions: options });
  assert.equal(seen, 1);
  return result;
}

async function fixtures() {
  // Reuse existing synthetic fixture builders without registering their tests.
  const path = new URL("./g5d4-invocation-evidence-self-test.mjs", import.meta.url);
  let text = readFileSync(path, "utf8").split("for (const n of [0, 1, 4]) test(")[0];
  assert.ok(text.includes("async function withSnapshot"));
  text = text.replace(/from "(\.\/[^\"]+)"/g, (_, p) => `from ${JSON.stringify(new URL(p, path).href)}`);
  text += "\nexport { actual, withSnapshot };\n//# sourceURL=g5d4-fd-synthetic-fixtures.mjs";
  return import(`data:text/javascript;base64,${Buffer.from(text).toString("base64")}`);
}

if (process.argv.length > 2) {
  // Capture no raw capsule, private path, binding or exception message in output.
  try { process.stdout.write(`${JSON.stringify(await isolatedChildEntry())}\n`); }
  catch (error) { process.stdout.write(`${JSON.stringify({ status: "REJECT", code: error.code ?? "VALIDATION_REJECTED", errorType: error.name })}\n`); process.exitCode = 2; }
} else {
  const { actual, withSnapshot } = await fixtures();
  async function withCapsule(fn) {
    await withSnapshot(actual(), "provider", async fixture => {
      const { directory, snapshotPath, snapshot } = fixture;
      const auth = await state.confirmSelfTestInvocation(directory, snapshotPath);
      const consumed = state.consumeInvocationAuthorization(directory, auth.path, snapshot);
      const unsigned = { version: INVOCATION_VERSION, runDirectory: directory, snapshotPath, consumedAuthorizationPath: consumed.path };
      const capsule = { ...unsigned, capsuleMac: hmacSha256Hex(state.readAliasKey(directory), "invocation-capsule", unsigned) };
      const capsulePath = state.atomicPublishPrivateFile(directory, "fd-test-capsule.json", canonicalJson(capsule));
      state.atomicPublishPrivateFile(directory, "transport-probe.ts", "export const value: number = 42;\n");
      await fn({ ...fixture, capsule, capsulePath, auth, consumed });
    });
  }
  test("actual direct launcher / entry read FD 3, Developer cwd and TypeScript import", async () => {
    await withCapsule(async ({ capsulePath }) => {
      const result = await launch(capsulePath);
      assert.equal(result.exitCode, 0, result.stdout); assert.equal(result.stderr, "");
      assert.deepEqual(JSON.parse(result.stdout), { status: "PASS", cwd: ROOT, fd: 3, regular: true, typescript: true });
    });
  });
  for (const probe of ["absent", "wrong_fd", "closed", "argv_injection", "env_injection", "stdin_injection", "live_provenance", "real_entry"]) {
    test(`${probe}: actual spawn fails closed without operator or real guard`, async () => {
      await withCapsule(async ({ capsulePath }) => {
        const r = await launch(capsulePath, probe);
        if (probe === "real_entry") {
          assert.equal(r.exitCode, 1); assert.match(r.stderr, /internal canonical child guard missing/);
        } else {
          assert.equal(r.exitCode, 2); assert.equal(JSON.parse(r.stdout).status, "REJECT");
          if (probe === "closed") assert.equal(JSON.parse(r.stdout).code, "EBADF");
        }
      });
    });
  }
  for (const kind of ["malformed", "capsule_binding", "capsule_integrity", "authorization_binding", "unsafe_file", "symlink"]) {
    test(`${kind}: transported capsule rejected`, async () => {
      await withCapsule(async ({ capsulePath, capsule, directory, consumed }) => {
        if (kind === "malformed") writeFileSync(capsulePath, "{invalid-json");
        if (kind === "capsule_integrity") writeFileSync(capsulePath, canonicalJson({ ...capsule, capsuleMac: "0".repeat(64) }));
        if (kind === "capsule_binding") {
          capsule.consumedAuthorizationPath = capsule.snapshotPath;
          const { capsuleMac, ...unsigned } = capsule;
          capsule.capsuleMac = hmacSha256Hex(state.readAliasKey(directory), "invocation-capsule", unsigned);
          writeFileSync(capsulePath, canonicalJson(capsule));
        }
        if (kind === "authorization_binding") {
          const record = JSON.parse(readFileSync(consumed.path)); record.binding.maxCalls = 2;
          const { mac, ...unsigned } = record;
          record.mac = hmacSha256Hex(state.readAliasKey(directory), "invocation-authorization", unsigned);
          writeFileSync(consumed.path, canonicalJson(record));
        }
        if (kind === "unsafe_file") chmodSync(consumed.path, 0o644);
        if (kind === "symlink") {
          const linked = join(directory, "fd-symlink.json"); symlinkSync(capsulePath, linked);
          await assert.rejects(launch(linked)); return;
        }
        const result = await launch(capsulePath);
        assert.equal(result.exitCode, 2); assert.equal(JSON.parse(result.stdout).status, "REJECT");
      });
    });
  }
  test("self-test authority cannot use live public wrapper; consumed cannot be reused", async () => {
    await withCapsule(async ({ directory, snapshotPath, snapshot, auth }) => {
      assert.throws(() => state.consumeInvocationAuthorization(directory, auth.path, snapshot));
      const result = await runG5d4AuthorizedStep({ runDirectory: directory, snapshotPath, confirmedAuthorizationPath: auth.path });
      assert.equal(result.childSpawnCount, 0);
    });
  });
  test("current invocation core consumes before actual failed spawn and permanently rejects retry", async () => {
    await withSnapshot(actual(), "provider", async ({ directory, snapshotPath, snapshot, reader }) => {
      const auth = await state.confirmSelfTestInvocation(directory, snapshotPath); let launches = 0;
      const launcher = async ({ capsulePath }) => {
        launches++;
        const cap = JSON.parse(readFileSync(capsulePath));
        state.readInvocationAuthorization(directory, cap.consumedAuthorizationPath, snapshot, "consumed");
        await launch(capsulePath, "spawn_failure");
      };
      const input = { runDirectory: directory, snapshotPath, confirmedAuthorizationPath: auth.path };
      const first = await runG5d4InvocationSelfTestOnly(input, reader, launcher);
      assert.equal(first.invocationCount, 1); assert.equal(first.verdict, "REJECT");
      const second = await runG5d4InvocationSelfTestOnly(input, reader, launcher);
      assert.equal(second.invocationCount, 0); assert.equal(launches, 1);
      assert.throws(() => state.consumeInvocationAuthorization(directory, auth.path, snapshot));
    });
  });
  test("historical installed tsx respawn loses the same FD and reproduces read ENXIO", async () => {
    assert.equal(process.platform, "darwin", "historical ENXIO reproduction requires the affected macOS host");
    await withCapsule(async ({ capsulePath }) => {
      const cli = join(ROOT, "node_modules/tsx/dist/cli.mjs");
      const installed = readFileSync(cli, "utf8");
      const match = installed.match(/const as=a\(((?:\(t,e\)=>).*?),"run"\);var Ve=/s);
      assert.ok(match, "installed tsx source changed: re-audit historical spawn helper");
      const probe = `const fs=require('node:fs');let code;try{fs.readFileSync(3,'utf8');code='READ_OK'}catch(e){code=e.code}console.log(JSON.stringify({regular:fs.fstatSync(3).isFile(),code}));`;
      const helper = `const{spawn:Vi}=require('node:child_process');const{createRequire}=require('node:module');const{pathToFileURL:Nn}=require('node:url');const Ie=createRequire(${JSON.stringify(cli)}),yu=()=>true,Ln=process.versions.node;const run=(${match[1]});run(['-e',${JSON.stringify(probe)}],{noCache:true}).on('close',c=>process.exitCode=c??1);`;
      const fd = openSync(capsulePath, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const r = spawnSync(process.execPath, ["-e", helper], { cwd: ROOT, env: cleanEnv, shell: false, stdio: ["ignore", "pipe", "pipe", fd], encoding: "utf8", timeout: 10000 });
        assert.equal(r.status, 0); assert.equal(r.stderr, "");
        assert.deepEqual(JSON.parse(r.stdout), { regular: false, code: "ENXIO" });
        assert.equal((await launch(capsulePath)).exitCode, 0);
      } finally { closeSync(fd); }
    });
  });
}
