#!/usr/bin/env node

import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });

const REQUIRED_PRODUCTION_PROVIDERS = {
  VOICE_PROVIDER: "elevenlabs",
  TRANSCRIPTION_PROVIDER: "openai",
  PRONUNCIATION_PROVIDER: "azure",
  SCRIPT_GENERATION_PROVIDER: "openai"
};

const REQUIRED_PRODUCTION_ENV = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENAI_API_KEY",
  "AZURE_SPEECH_KEY",
  "AZURE_SPEECH_REGION",
  "ELEVENLABS_API_KEY",
  "ELEVENLABS_TTS_MODEL_ID"
];

const BLOCKED_PRODUCTION_ENV = [
  "E2E_TEST_SECRET",
  "E2E_TEST_EMAIL",
  "E2E_TEST_PASSWORD"
];

const ALLOWED_PRODUCTION_LAUNCH_MODES = new Set(["private_beta", "small_cohort"]);

const COST_GUARD_KILL_SWITCHES = [
  {
    envName: "NATIVE_MINUTE_DISABLE_OPENAI",
    label: "OpenAI transcription / script generation"
  },
  {
    envName: "NATIVE_MINUTE_DISABLE_AZURE",
    label: "Azure pronunciation evaluator"
  },
  {
    envName: "NATIVE_MINUTE_DISABLE_ELEVENLABS",
    label: "ElevenLabs voice clone / model audio"
  },
  {
    envName: "NATIVE_MINUTE_DISABLE_STORAGE_UPLOADS",
    label: "Supabase Storage uploads"
  }
];
const DESTRUCTIVE_ACCOUNT_DELETION_ENV = "NATIVE_MINUTE_ENABLE_ACCOUNT_DELETION_DESTRUCTIVE";

function isSet(value) {
  return Boolean(value?.trim());
}

function isTruthy(value) {
  return ["1", "true", "yes", "on"].includes((value ?? "").trim().toLowerCase());
}

function isStrictProductionRuntime() {
  return (
    process.env.VERCEL_ENV?.trim().toLowerCase() === "production" ||
    process.env.NATIVE_MINUTE_ENV?.trim().toLowerCase() === "production" ||
    isTruthy(process.env.NATIVE_MINUTE_PRODUCTION_GUARD)
  );
}

function providerValue(name) {
  return (process.env[name] || "mock").trim().toLowerCase();
}

function printCheck(label, ok, okMessage, failMessage) {
  const status = ok ? "OK" : "BLOCKED";
  const message = ok ? okMessage : failMessage;
  console.log(`[${status}] ${label}: ${message}`);
}

const strictProduction = isStrictProductionRuntime();
let blocked = false;

console.log("Native Minute production readiness preflight");
console.log(`- strict production guard: ${strictProduction ? "enabled" : "disabled"}`);
console.log("- secret values: hidden");

if (!strictProduction) {
  console.log("- local/dev mode: mock providers and E2E helpers are allowed for development.");
  process.exit(0);
}

for (const [envName, expectedValue] of Object.entries(REQUIRED_PRODUCTION_PROVIDERS)) {
  const actualValue = providerValue(envName);
  const ok = actualValue === expectedValue;
  blocked = blocked || !ok;
  printCheck(envName, ok, expectedValue, `expected ${expectedValue}`);
}

for (const envName of REQUIRED_PRODUCTION_ENV) {
  const ok = isSet(process.env[envName]);
  blocked = blocked || !ok;
  printCheck(envName, ok, "set", "missing");
}

for (const envName of BLOCKED_PRODUCTION_ENV) {
  const ok = !isSet(process.env[envName]);
  blocked = blocked || !ok;
  printCheck(envName, ok, "not set", "must not be set in production");
}

const launchMode = (process.env.NATIVE_MINUTE_LAUNCH_MODE ?? "").trim().toLowerCase();
const launchModeOk = ALLOWED_PRODUCTION_LAUNCH_MODES.has(launchMode);
blocked = blocked || !launchModeOk;
printCheck(
  "NATIVE_MINUTE_LAUNCH_MODE",
  launchModeOk,
  launchMode,
  launchMode === "public_free"
    ? "public_free requires DB-backed quota enforcement before production"
    : "set to private_beta or small_cohort before production"
);

for (const { envName, label } of COST_GUARD_KILL_SWITCHES) {
  const enabled = isTruthy(process.env[envName]);
  console.log(`[OK] ${envName}: ${enabled ? `${label} disabled by kill switch` : "off"}`);
}

console.log(
  `[OK] ${DESTRUCTIVE_ACCOUNT_DELETION_ENV}: ${
    isTruthy(process.env[DESTRUCTIVE_ACCOUNT_DELETION_ENV])
      ? "armed; use only for intentional support/admin cleanup"
      : "off"
  }`
);

if (blocked) {
  console.error("Production preflight blocked. Fix provider choices, env presence, or launch mode before deploying.");
  process.exit(1);
}

console.log("Production preflight passed.");
