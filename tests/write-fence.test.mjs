import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import ts from "typescript";
import * as fence from "../lib/operations/write-fence.mjs";

const root = new URL("../", import.meta.url);
const require = createRequire(import.meta.url);
function compileMiddleware() {
  const source = readFileSync(new URL("middleware.ts", root), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  let authCalls = 0;
  class NextResponse extends Response {
    static next() { return new NextResponse(null, { headers: { "x-middleware-next": "1" } }); }
    static redirect(url) { return new NextResponse(null, { status: 307, headers: { Location: String(url) } }); }
  }
  const module = { exports: {} };
  const mockedRequire = name => {
    if (name === "@/lib/operations/write-fence") return fence;
    if (name === "next/server") return { NextResponse };
    if (name === "@supabase/ssr") return { createServerClient() {
      authCalls++;
      return { auth: { async getUser() { return { data: { user: { id: "offline-fixture" } }, error: null }; } } };
    } };
    if (name === "@/lib/supabase/config") return { hasSupabaseConfig: () => true, getSupabaseUrl: () => "https://offline.invalid", getSupabaseAnonKey: () => "offline" };
    if (name === "@/lib/navigation") return { buildLoginHref: () => "/login" };
    return require(name);
  };
  new Function("require", "module", "exports", compiled)(mockedRequire, module, module.exports);
  return { middleware: module.exports.middleware, config: module.exports.config, authCalls: () => authCalls };
}
function request(method, path, extraHeaders = {}) {
  return { method, nextUrl: new URL(path, "https://offline.invalid"), url: `https://offline.invalid${path}`,
    headers: new Headers(extraHeaders), cookies: { getAll: () => [], set() {} } };
}
async function withEnv(value, callback) {
  const previous = process.env.NATIVE_MINUTE_WRITE_FENCE;
  if (value === undefined) delete process.env.NATIVE_MINUTE_WRITE_FENCE;
  else process.env.NATIVE_MINUTE_WRITE_FENCE = value;
  try { return await callback(); }
  finally { if (previous === undefined) delete process.env.NATIVE_MINUTE_WRITE_FENCE; else process.env.NATIVE_MINUTE_WRITE_FENCE = previous; }
}
function routeWrites(directory, relative = "") {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const name = `${relative}/${entry.name}`;
    if (entry.isDirectory()) return routeWrites(new URL(`${entry.name}/`, directory), name);
    if (entry.name !== "route.ts") return [];
    const source = readFileSync(new URL(entry.name, directory), "utf8");
    return [...source.matchAll(/export\s+(?:async\s+)?function\s+(POST|PUT|PATCH|DELETE)\b/g)]
      .map(match => ({ method: match[1], path: name.replace(/\/route\.ts$/, "").replace(/\[([^\]]+)\]/g, "fixture") }));
  });
}

test("authority is default open and invalid configuration fails closed", () => {
  for (const value of [undefined, "", "0"]) {
    const env = { NATIVE_MINUTE_WRITE_FENCE: value };
    assert.equal(fence.getWriteFenceState(env).writesAllowed, true);
    assert.doesNotThrow(() => fence.assertWritesAllowed(env));
  }
  for (const value of ["1", "true", "off", " 0 ", "2"]) {
    const env = { NATIVE_MINUTE_WRITE_FENCE: value };
    assert.equal(fence.getWriteFenceState(env).writesAllowed, false);
    assert.throws(() => fence.assertWritesAllowed(env), error => error.status === 503 && error.code === "production_write_fence_active");
  }
});

test("every committed mutation route is denied before auth, quota, storage or provider admission", async () => {
  await withEnv("1", async () => {
    const runtime = compileMiddleware();
    let providerCalls = 0, quotaCalls = 0, writes = 0;
    const routes = routeWrites(new URL("app/", root));
    assert.ok(routes.length >= 20);
    for (const route of routes) {
      const response = await runtime.middleware(request(route.method, route.path));
      if (response.headers.get("x-middleware-next") === "1") { providerCalls++; quotaCalls++; writes++; }
      assert.equal(response.status, 503, `${route.method} ${route.path}`);
      assert.equal((await response.json()).writesAllowed, false);
    }
    assert.equal(runtime.authCalls(), 0);
    assert.deepEqual({ providerCalls, quotaCalls, writes }, { providerCalls: 0, quotaCalls: 0, writes: 0 });
  });
});

test("callback, GET repair, mobile bypass, data/RSC and unknown dynamic routes remain closed", async () => {
  await withEnv("1", async () => {
    const runtime = compileMiddleware();
    for (const path of ["/scripts/fixture/listen", "/scripts/fixture/listen/", "/scripts/fixture/listen?_rsc=fixture", "/auth/callback?code=offline", "/auth/callback/", "/%61uth/callback", "/mobile/auth/callback", "/mobile/auth/recovery", "/api/mobile/progress", "/api/scripts", "/_next/data/offline/scripts/fixture/listen.json", "/_next/image?url=offline", "/api/operations/write-fence/", "/future-uninventoried-route", "/"] ) {
      const response = await runtime.middleware(request("GET", path, { "x-middleware-subrequest": "middleware", "RSC": "1" }));
      assert.equal(response.status, 503, path);
      assert.equal(response.headers.get("Cache-Control"), "no-store");
      assert.equal(response.headers.get("Retry-After"), "30");
    }
    assert.equal(runtime.authCalls(), 0);
    assert.deepEqual(runtime.config.matcher, ["/:path*"]);
  });
});

test("closed status is machine readable; HEAD has no body; POST status cannot bypass", async () => {
  for (const value of ["0", "1", "invalid"]) {
    await withEnv(value, async () => {
      const runtime = compileMiddleware();
      const response = await runtime.middleware(request("GET", fence.WRITE_FENCE_STATUS_PATH));
      assert.equal(response.status, value === "0" ? 200 : 503);
      assert.equal((await response.json()).writesAllowed, value === "0");
      const head = await runtime.middleware(request("HEAD", fence.WRITE_FENCE_STATUS_PATH));
      assert.equal(await head.text(), "");
      assert.equal(runtime.authCalls(), 0);
      if (value !== "0") assert.equal((await runtime.middleware(request("POST", fence.WRITE_FENCE_STATUS_PATH))).status, 503);
    });
  }
});

test("safe static/legal reads remain usable and never create an Auth client", async () => {
  await withEnv("1", async () => {
    const runtime = compileMiddleware();
    for (const path of ["/_next/static/chunks/offline.js", "/favicon.ico", "/.well-known/apple-app-site-association", "/privacy", "/terms", "/support", "/support/account-deletion"]) {
      const response = await runtime.middleware(request("GET", path));
      assert.equal(response.headers.get("x-middleware-next"), "1", path);
      assert.equal(fence.isFenceSafeRead("POST", path), false);
      assert.equal((await runtime.middleware(request("POST", path))).status, 503);
    }
    assert.equal(runtime.authCalls(), 0);
  });
});

test("open admission preserves authenticated reads and route admission", async () => {
  await withEnv(undefined, async () => {
    const runtime = compileMiddleware();
    for (const [method, path] of [["GET", "/scripts"], ["POST", "/api/scripts"], ["GET", "/auth/callback"], ["POST", "/api/speak-script"]]) {
      const response = await runtime.middleware(request(method, path));
      assert.equal(response.headers.get("x-middleware-next"), "1");
    }
    assert.equal(runtime.authCalls(), 3);
  });
});

test("operator CLIs fail closed with no credentials or remote/service loading", () => {
  const operators = [["scripts/account-deletion-operator-runner.mjs", "--execute", "--stage", "provider"]];
  if (existsSync(new URL("scripts/account-deletion-operator-entry.mjs", root))) {
    operators.push(["scripts/account-deletion-operator-entry.mjs", "--execute", "--stage", "provider"], ["scripts/retention-purge-operator.mjs", "--mode", "execute", "--resource", "quota"], ["scripts/voice-source-cleanup-operator.mjs", "--mode", "execute"]);
  }
  for (const args of operators) {
    const child = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8", env: { PATH: process.env.PATH, NATIVE_MINUTE_WRITE_FENCE: "1", NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE: "1" } });
    assert.equal(child.status, 2, `${args[0]}: ${child.stderr}`);
    assert.equal(JSON.parse(child.stdout).safeReasonCode, "production_write_fence_active");
    assert.equal(child.stderr, "");
  }
});
