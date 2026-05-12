#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local", quiet: true });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const REQUIRED_MIGRATIONS = [
  "0001_init.sql",
  "0002_phase1_hardening.sql",
  "0003_phase25_hardening.sql",
  "0004_phase25_storage_guards.sql",
  "0005_phase5_recordings_storage.sql",
  "0006_phase6_script_audio_storage.sql",
  "0007_phase7_voice_sample_storage.sql",
  "0008_phase8_voice_consent_storage.sql",
  "0009_phase_s5_quota_events.sql",
  "0010_phase_s5_voice_quota_events.sql",
  "0011_phase_s6_audio_library.sql",
  "0012_phase_rr_account_deletion_requests.sql"
];

const REQUIRED_TABLES = [
  "profiles",
  "voice_consents",
  "voices",
  "scripts",
  "script_audios",
  "takes",
  "weak_words",
  "coach_feedback",
  "quota_events",
  "script_saved_model_audios",
  "script_saved_best_takes",
  "account_deletion_requests"
];

const REQUIRED_BUCKETS = [
  "recordings",
  "script-audios",
  "voice-samples",
  "voice-consents"
];

function isSet(value) {
  return Boolean(value?.trim());
}

function printCheck(label, ok, okMessage, failMessage) {
  const status = ok ? "OK" : "BLOCKED";
  console.log(`[${status}] ${label}: ${ok ? okMessage : failMessage}`);
}

let blocked = false;

function block() {
  blocked = true;
}

console.log("Native Minute Supabase / Storage / RLS readiness check");
console.log("- mode: non-destructive");
console.log("- secret values: hidden");
console.log("- raw storage paths / object keys: hidden");

const migrationsDir = path.join(repoRoot, "supabase", "migrations");
for (const filename of REQUIRED_MIGRATIONS) {
  const exists = fs.existsSync(path.join(migrationsDir, filename));
  if (!exists) {
    block();
  }
  printCheck(`migration ${filename}`, exists, "present", "missing");
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const hasUrl = isSet(supabaseUrl);
const hasServiceRole = isSet(serviceRoleKey);

if (!hasUrl) {
  block();
}
printCheck("NEXT_PUBLIC_SUPABASE_URL", hasUrl, "set", "missing");

if (!hasServiceRole) {
  block();
}
printCheck("SUPABASE_SERVICE_ROLE_KEY", hasServiceRole, "set", "missing");

if (hasUrl && hasServiceRole) {
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  for (const table of REQUIRED_TABLES) {
    const { error } = await admin.from(table).select("id", { count: "exact", head: true });
    const ok = !error;
    if (!ok) {
      block();
    }
    printCheck(`table ${table}`, ok, "reachable", "not reachable or missing");
  }

  const { data: buckets, error: bucketsError } = await admin.storage.listBuckets();
  if (bucketsError) {
    block();
    printCheck("storage buckets", false, "reachable", "not reachable");
  } else {
    printCheck("storage buckets", true, "reachable", "not reachable");
    const bucketById = new Map((buckets ?? []).map((bucket) => [bucket.id, bucket]));

    for (const bucketName of REQUIRED_BUCKETS) {
      const bucket = bucketById.get(bucketName);
      const exists = Boolean(bucket);
      if (!exists) {
        block();
        printCheck(`bucket ${bucketName}`, false, "exists and private", "missing");
        continue;
      }

      const isPrivate = bucket.public === false;
      if (!isPrivate) {
        block();
      }
      printCheck(`bucket ${bucketName}`, isPrivate, "exists and private", "exists but public");
    }
  }
} else {
  console.log("[SKIPPED] remote Supabase checks: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.");
}

console.log("[MANUAL] RLS cross-user checks must be run with authenticated user sessions.");
console.log("[MANUAL] Protected replay checks must be run through /api/script-audio/[audioId] and /api/takes/[takeId]/audio.");

if (blocked) {
  console.error("Supabase / Storage readiness check blocked. See runbook for manual follow-up.");
  process.exit(1);
}

console.log("Supabase / Storage readiness check passed for non-destructive checks.");
