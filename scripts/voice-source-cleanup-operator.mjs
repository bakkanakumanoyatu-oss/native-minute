#!/usr/bin/env node
import { parseArgs } from "node:util";
import dotenv from "dotenv";
import { runVoiceSourceCleanup } from "../services/voice/voice-source-cleanup.service.ts";
try {
  const { values } = parseArgs({ options: {
    mode: { type: "string" }, "after-id": { type: "string" }, help: { type: "boolean" }
  } });
  if (values.help) {
    console.log("voice:source-cleanup --mode execute [--after-id UUID]\nOne source per invocation. Advance the returned cursor even on skip/failure.\nAt sweep end, start the next separate sweep without a cursor. Requires the existing destructive guard.");
  } else {
    dotenv.config({ path: ".env.local", quiet: true });
    const result = await runVoiceSourceCleanup({ mode: values.mode, afterId: values["after-id"] });
    console.log(JSON.stringify(result, null, 2));
    if (!["succeeded", "skipped"].includes(result.status)) process.exitCode = 2;
  }
} catch {
  console.log(JSON.stringify({ status: "blocked", safeReasonCode: "source_cleanup_input_invalid" }));
  process.exitCode = 2;
}
