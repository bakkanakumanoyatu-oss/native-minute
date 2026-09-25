import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, test } from "node:test";

const preflightPath = fileURLToPath(new URL("../scripts/production-readiness-preflight.mjs", import.meta.url));
const emptyConfigDirectory = mkdtempSync(join(tmpdir(), "native-minute-preflight-"));
after(() => rmSync(emptyConfigDirectory, { recursive: true, force: true }));

const productionEnv = {
  VERCEL_ENV: "production",
  NATIVE_MINUTE_LAUNCH_MODE: "private_beta",
  VOICE_PROVIDER: "elevenlabs",
  TRANSCRIPTION_PROVIDER: "openai",
  PRONUNCIATION_PROVIDER: "azure",
  NEXT_PUBLIC_APP_URL: "https://example.test",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "public-test-value",
  SUPABASE_SERVICE_ROLE_KEY: "server-test-value",
  OPENAI_API_KEY: "openai-test-value",
  AZURE_SPEECH_KEY: "azure-test-value",
  AZURE_SPEECH_REGION: "test-region",
  ELEVENLABS_API_KEY: "elevenlabs-test-value",
  ELEVENLABS_TTS_MODEL_ID: "test-model"
};

function runPreflight(overrides = {}, omitted = []) {
  const env = { ...productionEnv, ...overrides };
  for (const name of omitted) delete env[name];

  const result = spawnSync(process.execPath, [preflightPath], {
    cwd: emptyConfigDirectory,
    env,
    encoding: "utf8"
  });
  assert.equal(result.error, undefined);
  return result;
}

function expectPass(result) {
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Production preflight passed\./);
}

function expectBlocked(result, expectedLine) {
  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, expectedLine);
}

test("generation OFF passes with SCRIPT_GENERATION_PROVIDER unset", () => {
  const result = runPreflight();
  expectPass(result);
  assert.match(result.stdout, /\[OK\] SCRIPT_GENERATION_PROVIDER: not required while AI script generation is disabled/);
  assert.match(result.stdout, /\[OK\] TRANSCRIPTION_PROVIDER: openai/);
  assert.match(result.stdout, /\[OK\] OPENAI_API_KEY: set/);
});

test("generation OFF passes with SCRIPT_GENERATION_PROVIDER=openai", () => {
  expectPass(runPreflight({ NATIVE_MINUTE_ENABLE_AI_SCRIPT_GENERATION: "0", SCRIPT_GENERATION_PROVIDER: "openai" }));
});

test("generation ON fails closed when provider is unset", () => {
  expectBlocked(runPreflight({ NATIVE_MINUTE_ENABLE_AI_SCRIPT_GENERATION: "1" }), /\[BLOCKED\] SCRIPT_GENERATION_PROVIDER: expected openai/);
});

for (const provider of ["mock", "unsupported"]) {
  test(`generation ON rejects ${provider} in production`, () => {
    expectBlocked(
      runPreflight({ NATIVE_MINUTE_ENABLE_AI_SCRIPT_GENERATION: "true", SCRIPT_GENERATION_PROVIDER: provider }),
      /\[BLOCKED\] SCRIPT_GENERATION_PROVIDER: expected openai/
    );
  });
}

test("generation ON passes with OpenAI provider and required settings", () => {
  const result = runPreflight({ NATIVE_MINUTE_ENABLE_AI_SCRIPT_GENERATION: "1", SCRIPT_GENERATION_PROVIDER: "openai" });
  expectPass(result);
  assert.match(result.stdout, /\[OK\] SCRIPT_GENERATION_PROVIDER: openai/);
});

test("OpenAI transcription provider and key remain required when generation is OFF", () => {
  expectBlocked(runPreflight({ TRANSCRIPTION_PROVIDER: "mock" }), /\[BLOCKED\] TRANSCRIPTION_PROVIDER: expected openai/);
  expectBlocked(runPreflight({}, ["OPENAI_API_KEY"]), /\[BLOCKED\] OPENAI_API_KEY: missing/);
});

test("other provider and release guards still block unsafe production settings", () => {
  const cases = [
    [{ VOICE_PROVIDER: "mock" }, /\[BLOCKED\] VOICE_PROVIDER: expected elevenlabs/],
    [{ PRONUNCIATION_PROVIDER: "mock" }, /\[BLOCKED\] PRONUNCIATION_PROVIDER: expected azure/],
    [{ NATIVE_MINUTE_LAUNCH_MODE: "public_free" }, /\[BLOCKED\] NATIVE_MINUTE_LAUNCH_MODE: public_free requires DB-backed quota enforcement/],
    [{ E2E_TEST_SECRET: "test-only" }, /\[BLOCKED\] E2E_TEST_SECRET: must not be set in production/]
  ];

  for (const [overrides, expectedLine] of cases) {
    expectBlocked(runPreflight(overrides), expectedLine);
  }
});
