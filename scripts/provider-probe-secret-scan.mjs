import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

// Values are inspected only in this process. No matches, lengths, hashes or
// file contents are returned, even on failure. Remote builds can also compare
// their own credential values without exporting them from Vercel.
const credentials = ["ELEVENLABS_API_KEY", "OPENAI_API_KEY", "SUPABASE_SERVICE_ROLE_KEY"]
  .map(name => process.env[name]).filter(value => typeof value === "string" && value.trim());
const skipped = new Set([".git", ".vercel", "node_modules", "outputs", "artifacts", "ios", "test-results", "test-results 2", "playwright-report", "coverage"]);
const pattern = /(?:sk-(?:proj-)?[A-Za-z0-9_-]{24,}|sbp_[a-f0-9]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,})/;
let fileCount = 0;
let findings = 0;
function scan(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (skipped.has(entry.name) || entry.isSymbolicLink()) continue;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) { scan(filename); continue; }
    if (!/\.(?:js|mjs|ts|tsx|json|md|txt|pem)$/.test(entry.name)) continue;
    const content = readFileSync(filename, "utf8");
    fileCount++;
    if (pattern.test(content) || credentials.some(value => content.includes(value))) findings++;
  }
}
scan(process.cwd());
console.log(JSON.stringify({ status: findings ? "FAIL" : "PASS", fileCount, secretPatternFindings: findings, runtimeCredentialLiteralFindings: findings ? "NOT_CLEARED" : 0 }));
if (findings) process.exitCode = 1;
