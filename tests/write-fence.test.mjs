import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import ts from "typescript";
import * as fence from "../lib/operations/write-fence.mjs";
import nextConfig from "../next.config.mjs";

const root = new URL("../", import.meta.url);
const METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"];

function loadProbeModule(relative) {
  const source = readFileSync(new URL(relative, root), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  let forbiddenDependencyCalls = 0;
  class NextResponse extends Response {
    static next() { return new NextResponse(null, { headers: { "x-middleware-next": "1" } }); }
  }
  const module = { exports: {} };
  const requirePoisoned = name => {
    if (name === "@/lib/operations/write-fence") return fence;
    if (name === "next/server") return { NextResponse };
    // Auth, DB, quota, Storage, provider and every other dependency are poisoned.
    forbiddenDependencyCalls++;
    throw new Error("forbidden_application_dependency");
  };
  new Function("require", "module", "exports", compiled)(requirePoisoned, module, module.exports);
  return { exports: module.exports, forbiddenDependencyCalls: () => forbiddenDependencyCalls };
}

function request(method, path) {
  return { method, nextUrl: new URL(path, "https://offline.invalid"), url: `https://offline.invalid${path}`,
    headers: new Headers({ "x-middleware-subrequest": "middleware:middleware:middleware:middleware:middleware", "RSC": "1" }) };
}

function originalMutationRoutes(directory, relative = "") {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const name = `${relative}/${entry.name}`;
    if (entry.isDirectory()) return originalMutationRoutes(new URL(`${entry.name}/`, directory), name);
    if (entry.name !== "route.ts") return [];
    const source = readFileSync(new URL(entry.name, directory), "utf8");
    return [...source.matchAll(/export\s+(?:async\s+)?function\s+(POST|PUT|PATCH|DELETE)\b/g)]
      .map(match => ({ method: match[1], path: name.replace(/\/route\.ts$/, "").replace(/\[([^\]]+)\]/g, "fixture") }));
  });
}

test("source hard fence cannot be opened by absent, disabled or malformed env", () => {
  for (const value of [undefined, "", "0", "1", "true", "off", " 0 ", "2"]) {
    const env = { NATIVE_MINUTE_WRITE_FENCE: value };
    assert.deepEqual(fence.getWriteFenceState(env), { writesAllowed: false, code: "production_write_fence_active", reason: "source_hard_probe" });
    assert.throws(() => fence.assertWritesAllowed(env), error => error.status === 503 && error.code === "production_write_fence_active");
  }
  assert.deepEqual(nextConfig.pageExtensions, ["probe.ts", "probe.tsx"]);
});

test("every original mutation URL reaches only the actual hard-denial catch-all", async () => {
  const runtime = loadProbeModule("middleware.probe.ts");
  const catchall = loadProbeModule("app/[...blocked]/route.probe.ts");
  const routes = originalMutationRoutes(new URL("app/", root));
  assert.ok(routes.length >= 20);
  for (const route of routes) {
    const rejected = await runtime.exports.middleware(request(route.method, route.path));
    assert.equal(rejected.status, 503, `${route.method} ${route.path}`);
    // Directly invoke the built route, simulating middleware being bypassed.
    const bypassRejected = await catchall.exports[route.method](request(route.method, route.path));
    assert.equal(bypassRejected.status, 503);
    assert.equal((await bypassRejected.json()).reason, "source_hard_probe");
  }
  assert.equal(runtime.forbiddenDependencyCalls(), 0);
  assert.equal(catchall.forbiddenDependencyCalls(), 0);
});

test("root and catch-all reject every supported HTTP method before any application dependency", async () => {
  for (const relative of ["app/route.probe.ts", "app/[...blocked]/route.probe.ts"]) {
    const route = loadProbeModule(relative);
    for (const method of METHODS) {
      const response = await route.exports[method](request(method, "/api/evaluate"));
      assert.equal(response.status, 503);
      assert.equal(response.headers.get("Cache-Control"), "no-store");
      assert.equal(response.headers.get("X-Native-Minute-Write-Fence"), "closed");
      if (method === "HEAD") assert.equal(await response.text(), "");
    }
    assert.equal(route.forbiddenDependencyCalls(), 0);
  }
});

test("status directly returns source hard fence with no network or application imports", async () => {
  const route = loadProbeModule("app/api/operations/write-fence/route.probe.ts");
  const response = await route.exports.GET();
  assert.equal(response.status, 503);
  assert.equal((await response.json()).writesAllowed, false);
  assert.equal(await (await route.exports.HEAD()).text(), "");
  assert.equal(route.forbiddenDependencyCalls(), 0);
});

test("middleware permits only exact signed-probe GET or inert static reads", async () => {
  const runtime = loadProbeModule("middleware.probe.ts");
  assert.deepEqual(runtime.exports.config.matcher, ["/:path*"]);
  for (const [method, path] of [["GET", "/api/operations/provider-readonly-probe"], ["GET", "/_next/static/offline.js"], ["HEAD", "/_next/static/offline.js"]]) {
    assert.equal((await runtime.exports.middleware(request(method, path))).headers.get("x-middleware-next"), "1");
  }
  for (const path of ["/", "/scripts", "/privacy", "/auth/callback?code=offline", "/api/scripts", "/_next/data/offline/scripts.json", "/_next/image?url=offline", "/api/operations/provider-readonly-probe/", "/api/operations/provider-readonly-probe/child", "/%61pi/operations/provider-readonly-probe"]) {
    assert.equal((await runtime.exports.middleware(request("GET", path))).status, 503, path);
  }
  for (const method of ["HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    assert.equal((await runtime.exports.middleware(request(method, "/api/operations/provider-readonly-probe"))).status, 503);
  }
  assert.equal(runtime.forbiddenDependencyCalls(), 0);
});

test("operator CLI is source-fenced even with write env disabled and destructive flag enabled", () => {
  const child = spawnSync(process.execPath, ["scripts/account-deletion-operator-runner.mjs", "--execute", "--stage", "provider"], {
    cwd: root, encoding: "utf8", env: { PATH: process.env.PATH, NATIVE_MINUTE_WRITE_FENCE: "0", NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE: "1" }
  });
  assert.equal(child.status, 2);
  const result = JSON.parse(child.stdout);
  assert.equal(result.safeReasonCode, "production_write_fence_active");
  assert.equal(result.destructiveOperationsAttempted, 0);
  assert.equal(child.stderr, "");
});
