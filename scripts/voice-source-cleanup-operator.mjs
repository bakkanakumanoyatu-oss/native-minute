#!/usr/bin/env node
import { parseArgs } from "node:util";
import dotenv from "dotenv";
import { runVoiceSourceCleanup } from "../services/voice/voice-source-cleanup.service.ts";
try {
  const { values, tokens } = parseArgs({ tokens: true, options: {
    mode: { type: "string" }, "after-id": { type: "string" }, "source-id": { type: "string" }, help: { type: "boolean" }
  } });
  if (tokens.filter(token => token.kind === "option" && token.name === "source-id").length > 1
    || (values["source-id"] !== undefined && values["after-id"] !== undefined)) {
    throw new Error("source_cleanup_input_invalid");
  }
  if (values.help) {
    console.log("voice:source-cleanup --mode execute [--after-id UUID | --source-id UUID]\nOne source per invocation. Sweep mode: advance the returned cursor even on skip/failure.\nAt sweep end, start the next separate sweep without a cursor.\nExact mode: one --source-id only, no candidate scan or fallback; nextAfterId is null.\nBoth modes require the existing destructive guard and DB eligibility/claim checks.");
  } else {
    dotenv.config({ path: ".env.local", quiet: true });
    const result = await runVoiceSourceCleanup({ mode: values.mode, afterId: values["after-id"], sourceId: values["source-id"] });
    console.log(JSON.stringify(result, null, 2));
    if (!["succeeded", "skipped"].includes(result.status)) process.exitCode = 2;
  }
} catch {
  console.log(JSON.stringify({ status: "blocked", safeReasonCode: "source_cleanup_input_invalid" }));
  process.exitCode = 2;
}
