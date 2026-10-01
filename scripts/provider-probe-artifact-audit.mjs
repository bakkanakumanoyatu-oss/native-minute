import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = path.resolve(root, process.argv[2] ?? ".next");
const requiredRoutes = ["/route", "/[...blocked]/route", "/api/operations/write-fence/route", "/api/operations/provider-readonly-probe/route"];
const allowedRoutes = new Set([...requiredRoutes, "/_not-found/page"]);
const builtinPages = new Set(["/_app", "/_document", "/_error", "/404", "/500"]);

function fail(code) { throw new Error(code); }
function readJson(relative) { return JSON.parse(readFileSync(path.join(dist, relative), "utf8")); }
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? files(filename) : [filename];
  });
}

try {
  const appPaths = readJson("server/app-paths-manifest.json");
  if (Object.keys(appPaths).some(route => !allowedRoutes.has(route))) fail("unexpected_application_route_in_build");
  if (requiredRoutes.some(route => !Object.hasOwn(appPaths, route))) fail("required_probe_route_missing");
  for (const route of requiredRoutes) {
    // Every admitted handler needs its own traced dependency evidence; default
    // Next pages cannot substitute for a missing application-handler trace.
    const trace = JSON.parse(readFileSync(path.join(dist, "server", `${appPaths[route]}.nft.json`), "utf8"));
    if (!Array.isArray(trace.files)) fail("probe_handler_trace_missing");
  }
  const pages = readJson("server/pages-manifest.json");
  if (Object.keys(pages).some(route => !builtinPages.has(route))) fail("unexpected_pages_router_route_in_build");
  const middleware = readJson("server/middleware-manifest.json");
  if (Object.keys(middleware.middleware).join(",") !== "/") fail("probe_middleware_missing_or_unexpected");
  if (Object.keys(middleware.functions).length) fail("unexpected_edge_function_in_build");

  const forbiddenTracePath = /(?:^|\/)(?:services|providers|lib\/supabase|lib\/script-studio)(?:\/|$)|node_modules\/(?:@supabase|microsoft-cognitiveservices-speech-sdk)(?:\/|$)/;
  const forbiddenSource = /\/v1\/voices\/add|text-to-speech|\/v1\/audio\/speech|\/v1\/audio\/transcriptions|persist_review_bundle|createSupabase(?:Admin|Server|Route|Browser)Client|AzureSpeechPronunciationEvaluator|ElevenLabsVoiceProvider|OpenAiVoiceProvider/;
  const generatedFiles = [...files(path.join(dist, "server")), ...files(path.join(dist, "static"))];
  let traceCount = 0;
  for (const filename of generatedFiles) {
    if (filename.endsWith(".nft.json")) {
      traceCount++;
      const trace = JSON.parse(readFileSync(filename, "utf8"));
      for (const relative of trace.files) {
        const resolved = path.resolve(path.dirname(filename), relative).replaceAll(path.sep, "/");
        if (forbiddenTracePath.test(resolved)) fail("application_mutation_dependency_in_trace");
      }
    }
    if (filename.endsWith(".js") && forbiddenSource.test(readFileSync(filename, "utf8"))) fail("application_mutation_implementation_in_bundle");
  }
  if (traceCount < requiredRoutes.length) fail("probe_trace_evidence_incomplete");
  process.stdout.write(JSON.stringify({ status: "PASS", appRouteCount: Object.keys(appPaths).length, traceCount, productRoutesExcluded: true, applicationMutationDependencies: 0 }) + "\n");
} catch (error) {
  process.stdout.write(JSON.stringify({ status: "FAIL", code: error?.message?.match(/^[a-z_]+$/)?.[0] ?? "artifact_audit_failed" }) + "\n");
  process.exitCode = 1;
}
