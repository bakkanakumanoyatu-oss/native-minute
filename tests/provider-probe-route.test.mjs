import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as auth from "../lib/operations/probe-operator-auth.mjs";

test("actual probe route denies mutations and unsigned reads before provider service", async () => {
  const source = readFileSync(new URL("../app/api/operations/provider-readonly-probe/route.probe.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  let providerCalls = 0;
  let applicationImports = 0;
  const requirePoisoned = name => {
    if (name === "@/lib/operations/probe-operator-auth.mjs") return auth;
    if (name === "@/lib/operations/provider-readonly-probe.mjs") return { runProbe() { providerCalls++; throw new Error("forbidden_provider_call"); } };
    applicationImports++;
    throw new Error("forbidden_application_import");
  };
  new Function("require", "module", "exports", compiled)(requirePoisoned, module, module.exports);
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]) {
    assert.equal((await module.exports[method]()).status, 503);
  }
  assert.equal((await module.exports.GET(new Request("https://offline.invalid/api/operations/provider-readonly-probe?mode=inventory"))).status, 403);
  assert.equal(providerCalls, 0);
  assert.equal(applicationImports, 0);
});
